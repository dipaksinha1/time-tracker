import { useEffect, useState } from "react";
import axios from "axios";

function formatTime(timestamp) {
  const date = new Date(timestamp);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // Handle midnight (0 hours)
  const formattedTime = `${hours}:${minutes < 10 ? "0" : ""}${minutes} ${ampm}`;
  return formattedTime;
}

const TimeSheet = ({ isRunning }) => {
  const [userFullname, setUserFullname] = useState("");
  const [userAttendance, setUserAttendance] = useState([]);

  useEffect(() => {
    const fetchUserFullName = async () => {
      try {
        const result = await axios.get("/user-fullname");
        setUserFullname(result?.data?.data?.fullName);
      } catch (error) {
        console.log(error);
      }
    };
    fetchUserFullName(); // Call the async function immediately
  }, []); // Empty dependency array indicates that this effect runs only once after the component mounts

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        const result = await axios.get("/attendance-records");
        setUserAttendance(result?.data?.data);
      } catch (error) {
        console.log(error);
      }
    };
    fetchAttendanceData(); // Fetch attendance data when user clocks in or out
  }, [isRunning]);

  return userAttendance.length === 0 ? (
    <h1 style={{ textAlign: "center", marginTop: "4rem" }}>
      SORRY... No Data Found
    </h1>
  ) : (
    <>
      <table>
        <thead>
          <tr>
            <th>S. No.</th>
            <th>Name</th>
            <th>Clock In</th>
            <th>Clock Out</th>
          </tr>
        </thead>
        <tbody>
          {userAttendance.map((record, index) => (
            <tr key={index}>
              <td>{record.id}</td>
              <td>{userFullname}</td>
              <td>{formatTime(record.clock_in)}</td>
              <td>
                {record.clock_out ? formatTime(record.clock_out) : "----"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
};

export default TimeSheet;
