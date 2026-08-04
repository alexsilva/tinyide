import type { TinyIdeModule } from "@tinyide/plugin-api";
import { htmlModule } from "@tinyide/module-html";

/** Catálogo das implementações básicas carregadas automaticamente pela IDE. */
export const builtinModules: readonly TinyIdeModule[] = [htmlModule];
