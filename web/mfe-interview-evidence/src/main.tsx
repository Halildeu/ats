import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { t } from "./i18n";

document.title = t("transcript.title"); // I18N-2: başlık da katalogdan

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
