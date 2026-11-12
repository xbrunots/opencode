import { createRoot } from "react-dom/client"
import { TooltipProvider } from "@/components/tooltip/components/tooltip"
import App from "./App"
import "@fontsource-variable/inter"
import "./index.css"
import "./workspace.css"

createRoot(document.getElementById("root")!).render(
  <TooltipProvider delay={350}>
    <App />
  </TooltipProvider>,
)
