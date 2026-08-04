import type { TinyIdeModule } from "@tinyide/plugin-api";
import { htmlLanguageProvider } from "./html-language";
import { HTML_MODULE_ID, installHtmlModule } from "./html-preview";

export const htmlModule: TinyIdeModule = {
  id: HTML_MODULE_ID,
  version: "0.1.0",
  init(context) {
    context.subscriptions.push(context.extensions.registerLanguageProvider(htmlLanguageProvider));
    context.subscriptions.push(installHtmlModule(context));
  },
};

export default htmlModule;
