import React, { useEffect, useState, useRef } from "react";
import TimeSheet from "./../components/TimeSheet";
import { useNavigate, Link } from "react-router-dom";
import axios from "axios";
import Webcam from "react-webcam";

const Home = () => {
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const [userPhoto, setUserPhoto] = useState(null);

  useEffect(() => {
    const checkTokenAndFetchData = async () => {
      try {
        // Send request to server to check if user is authenticated
        const response = await axios.get("/auth-check");
    
        if (response.status === 200) {
          // User is authenticated, fetch data
          try {
            const fetchDataResponse = await axios.get("/last-attendance");
    
            if (fetchDataResponse.status === 200) {
              const { data } = fetchDataResponse.data;
              console.log(data);
    
              if (data.clock_out === null) {
                setIsRunning(true);
              }
            } else {
              console.error("Failed to fetch data:", fetchDataResponse);
            }
          } catch (fetchError) {
            console.error("Error fetching data:", fetchError);
          }
        } else {
          // User is not authenticated, redirect to login page
          navigate("/login");
        }
      } catch (error) {
        console.error("Error:", error);
        navigate("/login");
      }
    };
    

    checkTokenAndFetchData();
  }, [navigate]);

  const fetchData = async () => {
    const apiUrl = isRunning ? "/clock-out" : "/clock-in";
    try {
      const result = await axios.post(apiUrl, {
        clientTimestamp: new Date().toISOString(),
        image: userPhoto,
      });
      if (result?.data?.success) {
        console.log(result.data.success);
        setIsRunning((prevState) => !prevState);
      }
      console.log(result);
    } catch (error) {
      console.log(error);
      if (error?.response?.status === 401) navigate("/login");
    }
  };

  const handleStartStop = () => {
    console.log(userPhoto);
    if (userPhoto === null) return;
    fetchData();
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
    try {
      const response = await axios.get("/logout");
      console.log(response.data);
      e.preventDefault(); // keep link from immediately navigating
      navigate("/login");
    } catch (error) {
      console.error("error", error);
    }
  };

  const videoConstraints = {
    width: 1280,
    height: 720,
    facingMode: "user",
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

      <TimeSheet isRunning={isRunning} />
    </div>
  );
};

export default Home;
