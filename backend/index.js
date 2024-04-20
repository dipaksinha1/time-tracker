const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
require("dotenv").config({ path: "../.env" });
const cron = require("node-cron");
const app = express();
const PORT = process.env.PORT || 3000;
const secretKey = process.env.SECRET_KEY;
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const { google } = require("googleapis");
const dbPath = path.resolve(__dirname, "db", "sqlite.db");
const csv = require("csv-writer").createObjectCsvWriter;

// Create SQLite database connection and specify disk storage
const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("Connected to the chinook database.");
  }
);

// Middleware to parse JSON requests
// Middleware setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));

// Have Node serve the files for our built React app
app.use(express.static(path.resolve(__dirname, "../frontend/dist")));

// Create Users and Attendance table schemas
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, firstname TEXT NOT NULL, lastname TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, token TEXT UNIQUE)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS Attendance (id INTEGER PRIMARY KEY, user_id INTEGER, clock_in TIMESTAMP NOT NULL, clock_out TIMESTAMP, image1 BLOB NOT NULL, image2 BLOB, FOREIGN KEY(user_id) REFERENCES Users(id))"
  );
});

// Validation middleware
function validateRegistration(req, res, next) {
  const { firstname, lastname, email, password } = req.body;

  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }
  next();
}

app.post("/register", validateRegistration, async (req, res) => {
  const { firstname, lastname, email, password } = req.body;

  try {
    // Check if email already exists
    db.get("SELECT * FROM Users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Error registering user" });
      }
      if (row) {
        // Email already exists
        return res
          .status(400)
          .json({ success: false, message: "Email already exists" });
      }
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
      // Insert the new user into the Users table
      db.run(
        "INSERT INTO Users (firstname, lastname, email, password_hash) VALUES (?, ?, ?, ?)",
        [firstname, lastname, email, hashedPassword],
        (err) => {
          if (err) {
            console.error(err);
            return res
              .status(500)
              .json({ success: false, message: "Error registering user" });
          }
          res
            .status(201)
            .json({ success: true, message: "User registered successfully" });
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error registering user" });
  }
});

app.post("/login", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;

  try {
    // Retrieve user from the database
    db.get("SELECT * FROM Users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Error logging in" });
      }

      if (!row) {
        // User not found
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      // Compare passwords
      const isValidPassword = await bcrypt.compare(password, row.password_hash);
      if (!isValidPassword) {
        // Invalid password
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }

      // Generate token
      const token = jwt.sign(row, secretKey, { expiresIn: 5000 });

      // Set token as HTTP Only cookie
      res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 300000,
      });

      // Update or insert token in the database
      res
        .status(200)
        .json({ success: true, message: "successfully logged in" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error while logging in" });
  }
});

app.get("/logout", (req, res) => {
  try {
    // Clear token cookie by setting an expired token
    res.cookie("token", "", {
      httpOnly: true,
      expires: new Date(0), // Set expiry date to past to immediately expire the cookie
    });

    res
      .status(200)
      .json({ success: true, message: "User logged out successfully" });
  } catch (error) {
    console.error("Error logging out:", error);
    res.status(500).json({ success: false, message: "Error logging out" });
  }
});

// middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token;
  console.log(token);
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token Not Found",
    });
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      return res
        .status(403)
        .json({ success: false, message: "Token Not Verified" });
    }
    req.user = user;
    next();
  });
}

//add-clock in only if last record was clock out or 1st one
app.post("/clock-in", authenticateToken, (req, res) => {
  const { user } = req;
  const { clientTimestamp, image } = req.body;

  // Validate clientTimestamp and image
  if (!clientTimestamp || !image) {
    return res
      .status(400)
      .json({ error: "clientTimestamp and image are required." });
  }
  if (typeof clientTimestamp !== "string" || !isValidISODate(clientTimestamp)) {
    return res
      .status(400)
      .json({ error: "clientTimestamp must be a valid ISO date string." });
  }

  // Function to validate ISO date format
  function isValidISODate(dateString) {
    return new Date(dateString).toISOString() === dateString;
  }

  const currentTime = new Date().toISOString();

  // Check the time difference between the server and the client
  const serverTime = new Date(currentTime).getTime();
  const clientTime = new Date(clientTimestamp).getTime();
  const timeDifferenceSeconds = Math.abs(serverTime - clientTime) / 1000;
  console.log(timeDifferenceSeconds);
  // Check if the time difference is within the allowed range (10 seconds)
  const allowedTimeDifference = 10; // Adjust as needed
  if (timeDifferenceSeconds > allowedTimeDifference) {
    return res.status(400).json({
      success: false,
      error:
        "Time difference between client and server is not within the allowed range of 10 seconds.",
    });
  }

  const currentDate = new Date().toISOString().slice(0, 10); // Get the current date in YYYY-MM-DD format

  // Check if the user has any existing attendance records
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? AND DATE(clock_in) = ? ORDER BY id DESC LIMIT 1",
    [user.id, currentDate],
    (err, row) => {
      if (err) {
        console.error("Error querying database:", err);
        return res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }

      // If there are no existing attendance records for the user, or the last record was a clock-out
      if (!row || row.clock_out) {
        // Proceed with clocking in
        const clockInTime = currentTime;
        // Insert the new attendance record into the database
        db.run(
          "INSERT INTO Attendance (user_id, clock_in, image1) VALUES (?, ?, ?)",
          [user.id, clockInTime, image],
          (err) => {
            if (err) {
              console.error("Error inserting attendance record:", err);
              return res
                .status(500)
                .json({ success: false, error: "Failed to clock in" });
            }
            return res
              .status(200)
              .json({ success: true, message: "Clock-in successful" });
          }
        );
      } else {
        // User already clocked in or no clock-out record found
        return res.status(400).json({
          success: false,
          error: "Cannot clock in, last record was not clocked out",
        });
      }
    }
  );
});

app.post("/clock-out", authenticateToken, (req, res) => {
  const { user } = req;
  const { clientTimestamp, image } = req.body;

  // Validate clientTimestamp and image
  if (!clientTimestamp || !image) {
    return res
      .status(400)
      .json({ error: "clientTimestamp and image are required." });
  }
  if (typeof clientTimestamp !== "string" || !isValidISODate(clientTimestamp)) {
    return res
      .status(400)
      .json({ error: "clientTimestamp must be a valid ISO date string." });
  }

  // Function to validate ISO date format
  function isValidISODate(dateString) {
    return new Date(dateString).toISOString() === dateString;
  }

  const currentTime = new Date().toISOString();

  // Check the time difference between the server and the client
  const serverTime = new Date(currentTime).getTime();
  const clientTime = new Date(clientTimestamp).getTime();
  const timeDifferenceSeconds = Math.abs(serverTime - clientTime) / 1000;

  // Check if the time difference is within the allowed range (10 seconds)
  const allowedTimeDifference = 10; // Adjust as needed
  if (timeDifferenceSeconds > allowedTimeDifference) {
    return res.status(400).json({
      success: false,
      error:
        "Time difference between client and server is not within the allowed range of 10 seconds.",
    });
  }

  const currentDate = new Date().toISOString().slice(0, 10); // Get the current date in YYYY-MM-DD format

  // Continue with clock-out process
  // Check if the user has an existing clock-in record
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? AND DATE(clock_in) = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1",
    [user.id, currentDate],
    (err, row) => {
      if (err) {
        console.error("Error querying database:", err);
        return res
          .status(500)
          .json({ success: false, error: "Internal Server Error" });
      }

      // If there's no existing clock-in record
      if (!row) {
        return res.status(400).json({
          success: false,
          error: "Cannot clock out, no existing clock-in record found",
        });
      }

      // Proceed with clocking out
      const clockOutTime = currentTime;
      const attendanceId = row.id;
      // Update the clock-out time and image for the last clock-in record
      db.run(
        "UPDATE Attendance SET clock_out = ?, image2 = ? WHERE id = ?",
        [clockOutTime, image, attendanceId],
        (err) => {
          if (err) {
            console.error("Error updating attendance record:", err);
            return res
              .status(500)
              .json({ success: false, error: "Failed to clock out" });
          }
          return res
            .status(200)
            .json({ success: true, message: "Clock-out successful" });
        }
      );
    }
  );
});

//sellect only those filds which are needed
app.get("/attendance-records", authenticateToken, (req, res) => {
  const { user } = req;
  console.log(user.id);

  const currentDate = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format

  db.all(
    "SELECT * FROM Attendance WHERE user_id = ? AND date(clock_in) = ? ORDER BY id DESC",
    [user.id, currentDate],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({
          success: false,
          message: "Error retrieving attendance records",
        });
      }
      res.status(200).json({ success: true, data: rows });
    }
  );
});

app.get("/get-all", (req, res) => {
  db.all("SELECT user_id,clock_in,clock_out FROM Attendance", (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).json({
        success: true,
        message: "Error retrieving attendance records",
      });
    }
    res.status(200).json({ success: true, data });
  });
});

app.get("/last-attendance", authenticateToken, (req, res) => {
  const { user } = req;
  const currentDate = new Date().toISOString().slice(0, 10); // Get today's date in YYYY-MM-DD format

  //if soemone has clocked out yesetrday and logged in today then clock ou will be reset because this api ig getting todays data
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? AND date(clock_in) = ? ORDER BY id DESC LIMIT 1",
    [user.id, currentDate],
    (err, data) => {
      if (err || !data) {
        console.error(err);
        return res.status(500).send({
          success: false,
          message: "Error retrieving attendance records",
        });
      }
      res.status(200).json({ success: true, data });
    }
  );
});

app.get("/user-fullname", authenticateToken, (req, res) => {
  const { user } = req;

  db.get(
    "SELECT firstname || ' ' || lastname AS fullName FROM Users WHERE id = ?",
    [user.id],
    (err, data) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Error retrieving user full name" });
      }
      res.status(200).json({ success: true, data });
    }
  );
});

app.get("/users", (req, res) => {
  const query =
    'SELECT (firstname || " " || lastname) AS fullname, email FROM Users';
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }

    console.log(rows);
    res.status(200).json({
      success: true,
      data: rows,
    });
  });
});

app.get("/exportcsv", async (req, res) => {
  // Query data from SQLite3 database

  // Calculate the date 14 days ago
  const date14DaysAgo = new Date();
  date14DaysAgo.setDate(date14DaysAgo.getDate() - 14);
  const formattedDate14DaysAgo = date14DaysAgo.toISOString().split("T")[0];

  const query = `
      SELECT (Users.firstname || " " || Users.lastname) AS fullname, 
             Attendance.clock_in, 
             Attendance.clock_out
      FROM Attendance
      INNER JOIN Users ON Attendance.user_id = Users.id
      WHERE DATE(Attendance.clock_in) >= DATE(?)
      ORDER BY  DATE(Attendance.clock_in), fullname
  `;
  db.all(query,[formattedDate14DaysAgo], async (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving data from database");
      return;
    }

    // Prepare CSV content
    const csvData = rows.map((row) => {
      const clockIn = moment(row.clock_in);
      const clockOut = moment(row.clock_out);
      let duration;

      if (row.clock_in && row.clock_out)
        duration = moment.duration(clockOut.diff(clockIn)).humanize();
      else duration = "NA";

      return {
        fullname: row.fullname,
        date: moment(row.clock_in).format("DD/MM/YYYY"),
        clockIn: moment(row.clock_in).format("hh:mm:ss a"),
        clockOut: moment(row.clock_out).format("hh:mm:ss a"),
        duration: duration,
      };
    });

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().slice(0, 10); // Format: YYYY-MM-DD
    const folderName = `Last_Sync_${formattedDate}`;

    // Set path for CSV file
    const filePath = path.join(__dirname, folderName, "attendance-csv.csv");

    // Create CSV writer
    const csvWriter = csv({
      path: filePath, // Set the path for the CSV file
      header: [
        { id: "fullname", title: "Full Name" },
        { id: "date", title: "Date" },
        { id: "clockIn", title: "Clock In" },
        { id: "clockOut", title: "Clock Out" },
        { id: "duration", title: "Duration" },
      ],
      fieldDelimiter: ",",
      encoding: "utf-8",
    });

    // Write CSV data to file
    csvWriter
      .writeRecords(csvData)
      .then(() => {
        res.download(filePath); // Download the created CSV file
      })
      .catch((error) => {
        console.error(error);
        res.status(500).send("Error creating CSV file");
      });
  });
});

app.get("/exporthtml", async (req, res) => {

    // Calculate the date 14 days ago
    const date14DaysAgo = new Date();
    date14DaysAgo.setDate(date14DaysAgo.getDate() - 14);
    const formattedDate14DaysAgo = date14DaysAgo.toISOString().split('T')[0];

  // Query data from SQLite3 database
  const query = `
      SELECT (Users.firstname || " " || Users.lastname) AS fullname, 
             Attendance.clock_in, 
             Attendance.clock_out, 
             Attendance.image1,
             Attendance.image2
      FROM Attendance
      INNER JOIN Users ON Attendance.user_id = Users.id
      WHERE DATE(Attendance.clock_in) >= DATE(?)
      ORDER BY  DATE(Attendance.clock_in), fullname
  `;
  db.all(query, [formattedDate14DaysAgo],async (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving data from database");
      return;
    }

    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Data</title>
        <style>
          table {
            border-collapse: collapse;
          }
          th, td {
            border: 1px solid black;
            padding: 8px;
          }
        </style>
      </head>
      <body>
        <h1>Attendance Data</h1>
        <table>
          <tr>
            <th>Full Name</th>
            <th>Date</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Duration</th>
            <th>Image 1</th>
            <th>Image 2</th>
          </tr>
    `;

    // Write rows
    for (const row of rows) {
      const clockIn = moment(row.clock_in);
      const clockOut = moment(row.clock_out);
      let duration;

      if (row.clock_in && row.clock_out)
        duration = moment.duration(clockOut.diff(clockIn)).humanize();
      else duration = "NA";

      const clockInTime = moment(row.clock_in).format("hh:mm:ss a");

      const clockOutTime = moment(row.clock_out).format("hh:mm:ss a");

      // Create a Moment.js object from the timestamp
      const date = moment(clockIn);

      // Extract the date using the format() function
      const dateString = date.format("DD/MM/YYYY"); // Format for day, month, and year

      // Base64-encoded images from the database
      const base64Image1 = row.image1;
      const base64Image2 = row.image2;

      // Include Base64-encoded images in HTML
      htmlContent += `
        <tr>
          <td style="border: 1px solid black; padding: 8px;">${row.fullname}</td>
          <td style="border: 1px solid black; padding: 8px;">${dateString}</td>
          <td style="border: 1px solid black; padding: 8px;">${clockInTime}</td>
          <td style="border: 1px solid black; padding: 8px;">${clockOutTime}</td>
          <td style="border: 1px solid black; padding: 8px;">${duration}</td>
          <td style="border: 1px solid black; padding: 8px;"><img src="${base64Image1}" width="100" height="100"></td>
          <td style="border: 1px solid black; padding: 8px;"><img src="${base64Image2}" width="100" height="100"></td>
        </tr>
      `;
    }

    // Close HTML content
    htmlContent += `
        </table>
      </body>
      </html>
    `;

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().slice(0, 10); // Format: YYYY-MM-DD
    const folderName = `Last_Sync_${formattedDate}`;

    // Define the file path where you want to save the HTML file
    const filePath = path.join(__dirname, folderName, "attendance-html.html");

    // Write the HTML content to the file
    fs.writeFile(filePath, htmlContent, (err) => {
      if (err) {
        console.error("Error saving HTML file:", err);
        res.status(500).send("Error saving HTML file");
        return;
      }
      console.log("HTML file saved successfully");

      // Set headers for HTML download
      res.setHeader("Content-Type", "text/html");
      res.setHeader("Content-Disposition", "attachment; filename=data.html");

      res.download(filePath); // Optionally, you can trigger a download of the HTML file
    });
  });
});

app.get("/auth-check", authenticateToken, (req, res) => {
  // If authentication middleware passes, user is authenticated
  res.status(200).json({ success: true, message: "Authorized user" }); // Send a 200 OK status code
});

const backupDaily = async () => {
  try {
    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().slice(0, 10); // Format: YYYY-MM-DD

    const folderName = `Last_Sync_${formattedDate}`;
    const folderPath = path.join(__dirname, folderName);

    if (!fs.existsSync(folderPath)) {
      // Create the folder
      fs.mkdirSync(folderPath);
    }
    await axios.get(`http://localhost:${PORT}/exportcsv`);
    console.log("CSV backup completed successfully");

    await axios.get(`http://localhost:${PORT}/exporthtml`);
    console.log("HTML backup completed successfully");

    await uploadToDrive();
  } catch (error) {
    console.error("Error during backup:", error.message);
  }
};

async function uploadFilesToDrive(folderName, files, parentFolderId) {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "google-api-key.json",
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    const drive = google.drive({ version: "v3", auth });

    // Create the "Last Sync" subfolder inside the "backup" folder
    const syncFolderMetadata = {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    };
    const createdSyncFolder = await drive.files.create({
      resource: syncFolderMetadata,
      fields: "id",
    });
    const syncFolderId = createdSyncFolder.data.id;
    console.log(`"Last Sync" folder created with ID: ${syncFolderId}`);

    // Upload files to the "Last Sync" subfolder
    for (const file of files) {
      const fileMetadata = {
        name: file.name,
        parents: [syncFolderId],
      };
      const media = {
        mimeType: file.mimeType,
        body: fs.createReadStream(file.path),
      };
      const uploadedFile = await drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: "id",
      });
      console.log(
        `File "${file.name}" uploaded with ID: ${uploadedFile.data.id}`
      );
    }

    console.log("All files uploaded successfully.");
  } catch (error) {
    console.error("Error uploading files to Drive:", error);
  }
}

async function uploadToDrive() {
  const currentDate = new Date();
  const formattedDate = currentDate.toISOString().slice(0, 10); // Format: YYYY-MM-DD
  const folderName = `Last_Sync_${formattedDate}`;
  const parentFolderId = process.env.PARENT_FOLDER_ID; // Replace with "backup" folder ID

  const files = [
    {
      name: "attendance-csv.csv",
      path: path.join(__dirname, folderName, "attendance-csv.csv"),
      mimeType: "text/csv",
    },
    {
      name: "attendance-html.html",
      path: path.join(__dirname, folderName, "attendance-html.html"),
      mimeType: "text/html",
    },
  ];

  await uploadFilesToDrive(folderName, files, parentFolderId);
}

/**
 * Validates the format of a time string.
 *
 * Time format should be in the following format:
 *   - Hours: 1-12 (with optional leading zero)
 *   - Minutes: 00-59
 *   - Period: am or pm (case-insensitive)
 *
 * @param {string} time - The time string to validate.
 * @returns {boolean} - True if the time format is valid, false otherwise.
 */

function validateTimeFormat(time) {
  const regex = /^(0?[1-9]|1[0-2]):([0-5][0-9]) (am|pm)$/i;
  return regex.test(time);
}

function generateCronSchedule(time) {
  const [timeStr, period] = time.split(" ");
  const [hours, minutes] = timeStr.split(":").map(Number);
  let cronHours = hours;
  if (period === "pm" && hours !== 12) {
    cronHours += 12;
  } else if (period === "am" && hours === 12) {
    cronHours = 0;
  }
  const cronSchedule = `${minutes} ${cronHours} * * *`;
  return cronSchedule;
}

// Function to schedule cron job internally
function scheduleCronJob() {
  let time = process.env.CRON_TIME || "11:30 pm"; // Get time from environment variable or set default
  time = time.toLowerCase();

  if (!validateTimeFormat(time)) {
    console.error("Invalid time format");
    return;
  }

  const cronSchedule = generateCronSchedule(time);
  cron.schedule(cronSchedule, () => {
    console.log("Cron job executed at:", new Date().toISOString());
    backupDaily();
  });

  console.log("Cron job scheduled successfully");
}

// Call the scheduling function when the application starts
scheduleCronJob();

// All other GET requests not handled before will return our React app
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "../frontend/dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
