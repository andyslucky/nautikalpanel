import type {GameServerStore} from "./game-server-store.ts";
import type {TemplateRepositoryStore} from "./template-repository-store.ts";

export type StoreTypes = {
    gameServers : GameServerStore,
    templateRepositories : TemplateRepositoryStore
}