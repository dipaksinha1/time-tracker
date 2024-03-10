import { useState } from "react";
// import './App.css';
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  console.log({ email, password });
  const handleEmail = (e) => {
    setEmail(e.target.value);
  };

  const handlePassword = (e) => {
    setPassword(e.target.value);
  };

  const handleApi = () => {
    if (email.trim() === "" || password.trim() === "") {
      setErrorMessage("Please fill in both email and password fields.");
      return;
    }

    console.log({ email, password });
    axios
      .post("http://localhost:3000/login", {
        email: email,
        password: password,
      })
      .then((result) => {
        console.log(result.data);
        // alert("success");
        localStorage.setItem("token", result.data.token);
        navigate("/home");
      })
      .catch((error) => {
        alert("service error");
        console.log(error);
      });
  };

  return (
    // <div className="App">
    //   Email :
    //   <input value={email} onChange={handleEmail} type="text" required /> <br />
    //   Password :
    //   <input
    //     value={password}
    //     onChange={handlePassword}
    //     type="password"
    //     required
    //   />
    //   <br />
    //   {errorMessage && <div>{errorMessage}</div>}
    //   <br />
    //   <button onClick={handleApi}>Login</button>
    // </div>
    <div className="login">
      <div className="container">
        <div className="form" id="login">
          <h1 className="form__title">Login</h1>
          <div className="form__input-group">
            <input
              value={email}
              onChange={handleEmail}
              type="text"
              className="form__input"
              autoFocus
              placeholder="Username"
              id="usernameinput"
            />
          </div>
          <div className="form__input-group">
            <input
              type="password"
              value={password}
              onChange={handlePassword}
              className="form__input"
              autoFocus
              placeholder="Password"
              id="passwordInput"
            />
            <div className="padding"></div>
            <button
              className="form__button"
              id="loginButton"
              onClick={handleApi}
            >
              Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
