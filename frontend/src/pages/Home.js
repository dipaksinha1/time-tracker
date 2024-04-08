import React, { useEffect, useState, useRef } from "react";
import TimeSheet from "./../components/TimeSheet";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Webcam from "react-webcam";

const Home = () => {
  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user",
  };

  const navigate = useNavigate();
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [userAttendance, setUserAttendance] = useState([]);
  const [userPhoto, setUserPhoto] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const checkTokenAndFetchData = async () => {
      if (!localStorage.getItem("token")) {
        navigate("/login");
        return;
      }

      try {
        const response = await axios.get("/last-attendance", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        console.log(response);
        console.log(response.data.data);

        if (response.data.data.clock_out === null) {
          const providedTimestamp = response.data.clock_in;
          const providedDate = new Date(providedTimestamp);
          const currentDate = new Date();
          const timeDifferenceInMilliseconds = currentDate - providedDate;
          const timeDifferenceInSeconds = Math.floor(
            timeDifferenceInMilliseconds / 1000
          );

          startTimerAfterLogin(timeDifferenceInSeconds);
        }
      } catch (error) {
        console.error("error", error);
      }
    };

    checkTokenAndFetchData();
  }, [navigate]);

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        const result = await axios.get("/attendance-records", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });
        setUserAttendance(result?.data?.data);
      } catch (error) {
        console.log(error);
      }
    };

    fetchAttendanceData(); // Fetch attendance data when user clocks in or out
  }, [isRunning]);

  const startTimerAfterLogin = (timeDifferenceInSeconds) => {
    setIsRunning(true);
    setTime(timeDifferenceInSeconds);
    intervalRef.current = setInterval(() => {
      console.log("tick tick ...");
      setTime((prevTime) => prevTime + 1);
    }, 1000);
  };

  const handleStartStop = () => {
    console.log(userPhoto);
    if (userPhoto === null) return;

    setIsRunning((prevState) => !prevState);
    fetchData();

    if (isRunning) {
      setTime(0);
      clearInterval(intervalRef.current);
    } else {
      intervalRef.current = setInterval(() => {
        console.log("tick tick ...");
        setTime((prevTime) => prevTime + 1);
      }, 1000);
    }
  };

  const fetchData = async () => {
    const apiUrl = isRunning ? "/clock-out" : "/clock-in";

    try {
      const result = await axios.post(
        apiUrl,
        { clientTimestamp: new Date().toISOString(), image: userPhoto },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        }
      );
    } catch (error) {
      console.log(error);
    }
  };

  const formatTime = (time) => {
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = time % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const today = new Date();
  const formattedFullDate = today.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const formattedPartialDate = today.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
  });

  const logoutUser = async (e) => {
    clearInterval(intervalRef.current); // Clear the interval before logging out

    try {
      const response = await axios.get("/logout", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      console.log(response.data);
      e.preventDefault(); // keep link from immediately navigating
      localStorage.clear();
      navigate("/login");
    } catch (error) {
      console.error("error", error);
    }
  };

  return (
    <div className="home">
      <div className="logout-link">
        <Link to="/login" onClick={logoutUser}>
          Logout
        </Link>
      </div>
      <h1 className="header">Clock In/Out</h1>
      <div className="current-date">{formattedFullDate}(Today)</div>
      {/* <div className="circle"> */}
      <div className="video">
        {userPhoto ? (
          <>
            <img src={userPhoto} />
            <button
              className="capture-button"
              onClick={() => {
                setUserPhoto(null);
              }}
            >
              Click Again
            </button>
          </>
        ) : (
          <Webcam
            audio={false}
            height={250}
            screenshotFormat="image/jpeg"
            width={250}
            videoConstraints={videoConstraints}
            className="circle"
          >
            {({ getScreenshot }) => (
              <button
                className="capture-button"
                onClick={() => {
                  const imageSrc = getScreenshot();
                  setUserPhoto(imageSrc);
                }}
              >
                Capture photo
              </button>
            )}
          </Webcam>
        )}
        <br />
        <h1>Please provide a photo that includes your face.</h1>
      </div>
      {/* </div> */}
      <div className="current-status">Total Hours</div>
      <div className="time">{formatTime(time)}</div>
      <div
        className={`clock-button ${userPhoto ? "" : "clock-button-disabled"}`}
      >
        <button
          disabled={userPhoto ? false : true}
          onClick={() => {
            handleStartStop();
          }}
        >
          {isRunning ? "Clock Out" : "Clock In"}
        </button>
      </div>
      {!userPhoto && (
        <h1 className="caution">
          To Enable clock in/out button please click your photo
        </h1>
      )}
      <h1 className="recent-punches">RECENT PUNCHES</h1>
      <h1 className="date">{formattedPartialDate}</h1>

      <MemoizedTimeSheet userAttendance={userAttendance} />
    </div>
  );
};

const MemoizedTimeSheet = React.memo(TimeSheet);

export default Home;
