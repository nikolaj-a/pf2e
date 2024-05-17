import type { Socket } from "socket.io";
import type {
    DatabaseCreateOperation,
    DatabaseDeleteOperation,
    DatabaseGetOperation,
    DatabaseUpdateOperation,
} from "../../../common/abstract/_types.d.ts";
import type { DatabaseBackend, Document } from "../../../common/abstract/module.d.ts";

/** The client-side database backend implementation which handles Document modification operations. */
export declare class ClientDatabaseBackend extends DatabaseBackend {
    /* -------------------------------------------- */
    /*  Document Modification Operations            */
    /* -------------------------------------------- */

    protected override _getDocuments(
        documentClass: typeof Document,
        operation: DatabaseGetOperation,
        user?: User,
    ): Promise<CompendiumIndexData[] | Document[]>;

    protected override _createDocuments(
        documentClass: typeof Document,
        operation: DatabaseCreateOperation,
        user?: User,
    ): Promise<ClientDocument[]>;

    protected override _updateDocuments(
        documentClass: typeof Document,
        operation: DatabaseUpdateOperation,
        user?: User,
    ): Promise<Document[]>;

    protected override _deleteDocuments(
        documentClass: typeof Document,
        operation: DatabaseDeleteOperation,
        user?: User,
    ): Promise<Document[]>;

    /* -------------------------------------------- */
    /*  Socket Workflows                            */
    /* -------------------------------------------- */

    /** Activate the Socket event listeners used to receive responses from events which modify database documents */
    activateSocketListeners(socket: Socket): void;

    /* -------------------------------------------- */
    /*  Helper Methods                              */
    /* -------------------------------------------- */

    override getFlagScopes(): string[];

    override getCompendiumScopes(): string[];
}
