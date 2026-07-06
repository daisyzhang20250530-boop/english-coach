import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// 原代码为 Claude.ai 环境编写，依赖 window.storage；本地用浏览器 localStorage 替代
if (!window.storage) {
  window.storage = {
    async get(key) {
      const v = localStorage.getItem(key);
      return v == null ? null : { value: v };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
