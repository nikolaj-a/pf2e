import { ActorPF2e } from "@actor";
import { ModifierPF2e, RawModifier, StatisticModifier } from "@actor/modifiers.ts";
import { DCSlug } from "@actor/types.ts";
import { SAVE_TYPES } from "@actor/values.ts";
import type { ItemPF2e } from "@item";
import { TokenPF2e } from "@module/canvas/index.ts";
import { RollNotePF2e, RollNoteSource } from "@module/notes.ts";
import { ActionMacroHelpers } from "@system/action-macros/index.ts";
import {
    ActionGlyph,
    CheckContextData,
    CheckContextOptions,
    CheckMacroContext,
    CheckResultCallback,
} from "@system/action-macros/types.ts";
import { CheckDC, DegreeOfSuccessString } from "@system/degree-of-success.ts";
import { getActionGlyph, isObject, tupleHasValue } from "@util";
import { BaseAction, BaseActionData, BaseActionVariant, BaseActionVariantData } from "./base.ts";
import { ActionUseOptions } from "./types.ts";

type SingleCheckActionRollNoteData = Omit<RollNoteSource, "selector"> & { selector?: string };
function toRollNoteSource(data: SingleCheckActionRollNoteData): RollNoteSource {
    data.selector ??= "";
    return data as RollNoteSource;
}

function isValidDifficultyClass(dc: unknown): dc is CheckDC | DCSlug {
    if (isObject<{ value: unknown }>(dc) && typeof dc.value === "number") {
        return true;
    }

    const slug = String(dc);
    return (
        ["ac", "armor", "perception"].includes(slug) || tupleHasValue(SAVE_TYPES, slug) || slug in CONFIG.PF2E.skills
    );
}

function toRollNotes(outcomes: Partial<Record<DegreeOfSuccessString, string>>, selector: string): RollNotePF2e[] {
    return Object.entries(outcomes).map(([degreeOfSuccess, text]) => {
        const outcome = [degreeOfSuccess as DegreeOfSuccessString];
        if (degreeOfSuccess === "success" && !("criticalSuccess" in outcomes)) outcome.push("criticalSuccess");
        if (degreeOfSuccess === "failure" && !("criticalFailure" in outcomes)) outcome.push("criticalFailure");
        const title = `PF2E.Check.Result.Degree.Check.${degreeOfSuccess}`;
        return new RollNotePF2e({ selector, outcome, text, title });
    });
}

interface SingleCheckActionVariantData extends BaseActionVariantData {
    difficultyClass?: CheckDC | DCSlug;
    modifiers?: RawModifier[];
    notes?: SingleCheckActionRollNoteData[];
    outcomes?: Partial<Record<DegreeOfSuccessString, string>>;
    rollOptions?: string[];
    statistic?: string | string[];
}

interface SingleCheckActionData extends BaseActionData<SingleCheckActionVariantData> {
    difficultyClass?: CheckDC | DCSlug;
    modifiers?: RawModifier[];
    notes?: SingleCheckActionRollNoteData[];
    outcomes?: Partial<Record<DegreeOfSuccessString, string>>;
    rollOptions?: string[];
    statistic: string | string[];
}

interface ActionVariantCheckPreviewOptions {
    actor: ActorPF2e;
}

interface ActionCheckPreviewOptions extends ActionVariantCheckPreviewOptions {
    variant: string;
}

interface ActionCheckPreview {
    label: string;
    modifier?: number;
    slug: string;
}

interface SingleCheckActionUseOptions extends ActionUseOptions {
    difficultyClass: CheckDC | DCSlug | number;
    modifiers: ModifierPF2e[];
    multipleAttackPenalty: number;
    notes: SingleCheckActionRollNoteData[];
    rollOptions: string[];
    statistic: string;
}

class SingleCheckActionVariant extends BaseActionVariant {
    readonly #action: SingleCheckAction;
    readonly #difficultyClass?: CheckDC | DCSlug;
    readonly #modifiers?: RawModifier[];
    readonly #notes?: RollNoteSource[];
    readonly #outcomes?: Partial<Record<DegreeOfSuccessString, string>>;
    readonly #rollOptions?: string[];
    readonly #statistic?: string | string[];

    constructor(action: SingleCheckAction, data?: SingleCheckActionVariantData) {
        super(action, data);
        this.#action = action;
        if (data) {
            this.#difficultyClass = data.difficultyClass;
            this.#modifiers = data?.modifiers;
            this.#notes = data.notes ? data.notes.map(toRollNoteSource) : undefined;
            this.#outcomes = data.outcomes;
            this.#rollOptions = data.rollOptions;
            this.#statistic = data.statistic;
        }
    }

    get difficultyClass(): CheckDC | DCSlug | undefined {
        return this.#difficultyClass ?? this.#action.difficultyClass;
    }

    get modifiers(): RawModifier[] {
        return this.#modifiers ?? this.#action.modifiers;
    }

    get notes(): RollNoteSource[] {
        return this.#notes ?? this.#action.notes;
    }

    get outcomes(): Partial<Record<DegreeOfSuccessString, string>> {
        return this.#outcomes ?? this.#action.outcomes;
    }

    get rollOptions(): string[] {
        return this.#rollOptions ?? this.#action.rollOptions;
    }

    get statistic(): string | string[] {
        return this.#statistic ?? this.#action.statistic;
    }

    override async descriptionSuffix(): Promise<string | undefined> {
        const outcomes = this.outcomes;
        if (Object.keys(outcomes).length) {
            return await renderTemplate("/systems/pf2e/templates/actors/actions/single/chat-message-suffix.hbs", {
                outcomes,
            });
        }
        return super.descriptionSuffix();
    }

    preview(options: Partial<ActionVariantCheckPreviewOptions> = {}): ActionCheckPreview[] {
        const slugs = this.#statistic || this.#action.statistic;
        const candidates = Array.isArray(slugs) ? slugs : [slugs];

        // TODO: append relevant statistic replacements from the actor

        return candidates
            .map((candidate) =>
                this.toActionCheckPreview({ actor: options.actor, rollOptions: this.rollOptions, slug: candidate }),
            )
            .filter((preview): preview is ActionCheckPreview => !!preview);
    }

    override async use(options: Partial<SingleCheckActionUseOptions> = {}): Promise<CheckResultCallback[]> {
        const modifiers = this.modifiers.map((raw) => new ModifierPF2e(raw)).concat(options.modifiers ?? []);
        if (options.multipleAttackPenalty) {
            const map = options.multipleAttackPenalty;
            const modifier = map > 0 ? Math.min(2, map) * -5 : map;
            modifiers.push(new ModifierPF2e({ label: "PF2E.MultipleAttackPenalty", modifier }));
        }
        const notes = (this.notes as SingleCheckActionRollNoteData[])
            .concat(options.notes ?? [])
            .map(toRollNoteSource)
            .map((note) => new RollNotePF2e(note));
        const rollOptions = this.rollOptions.concat(options.rollOptions ?? []);
        const slug = options.statistic?.trim() || (Array.isArray(this.statistic) ? this.statistic[0] : this.statistic);
        const title = this.name
            ? `${game.i18n.localize(this.#action.name)} - ${game.i18n.localize(this.name)}`
            : game.i18n.localize(this.#action.name);
        const difficultyClass = Number.isNumeric(options.difficultyClass)
            ? { value: Number(options.difficultyClass) }
            : isValidDifficultyClass(options.difficultyClass)
              ? options.difficultyClass
              : this.difficultyClass;
        const results: CheckResultCallback[] = [];

        await ActionMacroHelpers.simpleRollActionCheck({
            actors: options.actors,
            title,
            actionGlyph: getActionGlyph(this.cost ?? null) as ActionGlyph,
            callback: (result) => results.push(result),
            checkContext: (opts) => this.checkContext(opts, { modifiers, rollOptions, slug }),
            difficultyClass,
            event: options.event,
            extraNotes: (selector) => {
                return [
                    ...toRollNotes(this.outcomes, selector),
                    ...notes.map((note) => {
                        note.selector ||= selector; // treat empty selectors as always applicable to this check
                        return note;
                    }),
                ];
            },
            target: () => {
                if (options.target instanceof ActorPF2e) {
                    return { token: null, actor: options.target };
                } else if (options.target instanceof TokenPF2e) {
                    return options.target.actor
                        ? { token: options.target.document, actor: options.target.actor }
                        : null;
                }
                return null;
            },
            traits: this.traits.concat(options?.traits ?? []),
        });

        return results;
    }

    protected checkContext<ItemType extends ItemPF2e<ActorPF2e>>(
        opts: CheckContextOptions<ItemType>,
        data: CheckContextData<ItemType>,
    ): CheckMacroContext<ItemType> | undefined {
        return ActionMacroHelpers.defaultCheckContext(opts, data);
    }

    protected toActionCheckPreview(args: {
        actor?: ActorPF2e;
        rollOptions: string[];
        slug: string;
    }): ActionCheckPreview | null {
        if (args.actor) {
            const statistic = args.actor.getStatistic(args.slug);
            if (statistic) {
                const modifier = new StatisticModifier(args.slug, statistic.modifiers, args.rollOptions);
                return { label: statistic.label, modifier: modifier.totalModifier, slug: args.slug };
            }
        } else {
            const label = ActionMacroHelpers.getSimpleCheckLabel(args.slug) ?? game.i18n.localize(args.slug);
            return { label, slug: args.slug };
        }
        return null;
    }
}

class SingleCheckAction extends BaseAction<SingleCheckActionVariantData, SingleCheckActionVariant> {
    readonly difficultyClass?: CheckDC | DCSlug;
    readonly modifiers: RawModifier[];
    readonly notes: RollNoteSource[];
    readonly outcomes: Partial<Record<DegreeOfSuccessString, string>>;
    readonly rollOptions: string[];
    readonly statistic: string | string[];

    constructor(data: SingleCheckActionData) {
        super(data);
        this.difficultyClass = data.difficultyClass;
        this.modifiers = data.modifiers ?? [];
        this.notes = (data.notes ?? []).map(toRollNoteSource);
        this.outcomes = data.outcomes ?? {};
        this.rollOptions = data.rollOptions ?? [];
        this.statistic = data.statistic;
    }

    preview(options: Partial<ActionCheckPreviewOptions> = {}): ActionCheckPreview[] {
        return this.getDefaultVariant(options).preview(options);
    }

    protected override toActionVariant(data?: SingleCheckActionVariantData): SingleCheckActionVariant {
        return new SingleCheckActionVariant(this, data);
    }
}

export { SingleCheckAction, SingleCheckActionVariant };
export type { ActionCheckPreview, SingleCheckActionUseOptions, SingleCheckActionVariantData };
