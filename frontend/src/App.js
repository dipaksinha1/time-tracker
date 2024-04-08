import React from "react";
import ReactDOM from "react-dom/client";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { Routes, Route, BrowserRouter } from "react-router-dom";

const App = () => {
  console.log('--------------')
  console.log(process.env.S3_BUCKET)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/home" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<App />);