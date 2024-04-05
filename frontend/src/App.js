import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import Login from "./pages/Login";
import Home from "./pages/Home";
import { Routes, Route, BrowserRouter, Navigate } from "react-router-dom";
import axios from "axios";

const App = () => {
  const [auth, setAuth] = useState(false);
  useEffect(() => {
    async function isAuthenticated() {
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const result = await axios.get("http://localhost:3000/verify-token", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          setAuth(result?.data?.data?.success);
        } catch (error) {
          setAuth(false);
          console.log(error);
        }
      } else {
        setAuth(false);
      }
    }
    isAuthenticated();
  }, []);
console.log(auth)
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        {auth ? (
          <Route path="/home" element={<Home />} />
        ) : (
          <Route path="/home" element={<Navigate to="/login" />} />
        )}
      </Routes>
    </BrowserRouter>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<App />);
