import { useEffect, useState } from "react";
// import './App.css';
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const result = await axios.get("/users");
        setEmail(result?.data?.data[0]?.email);
        setUsers(result?.data?.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchUsers();
  }, []);

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

    axios
      .post("/login", {
        email: email,
        password: password,
      })
      .then((result) => {
        
        // alert("success");
        navigate("/home");
      })
      .catch((error) => {
        // alert("service error");
        setErrorMessage("Invalid Password");
      });
  };

  return users.length === 0 ? (
    <h1>Loading..</h1>
  ) : (
    <div className="login">
      <div className="container">
        <div className="form" id="login">
          <h1 className="form__title">Login</h1>
          <div className="form__input-group">
            <label>
              <select
                name="selectUsername"
                className="form__input"
                value={email}
                onChange={handleEmail}
                autoFocus
              >
                {users &&
                  users.map((user, index) => (
                    <option value={user.email} key={index}>
                      {user.fullname}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="form__input-group">
            <input
              type="text"
              value={password}
              onChange={handlePassword}
              className="form__input"
              autoFocus
              placeholder="PIN"
              id="passwordInput"
              pattern="[0-9]*"
            />
            <div className="padding"></div>
            {errorMessage && <div className="error">{errorMessage}</div>}
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
