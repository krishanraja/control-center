import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// Shared ground first, then the two device systems, then the way in. The two
// systems are scoped to .stack and .split and never overlap, so load order
// only matters for the shared file.
import "./styles/base.css";
import "./styles/stack.css";
import "./styles/split.css";
import "./styles/entry.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
