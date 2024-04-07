const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const csvWriter = require("csv-write-stream");
const moment = require("moment");
require("dotenv").config();
console.log(process.env.S3_BUCKET);
const app = express();
const PORT = process.env.PORT || 3000;
const path = require('path');
const secretKey = process.env.SECRET_KEY; //Put this in env file
console.log(secretKey);

// Create SQLite database connection and specify disk storage
const db = new sqlite3.Database(
  "db/sqlite.db",
  sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
  (err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("Connected to the chinook database.");
  }
);

// Middleware to parse JSON requests
app.use(express.json());

// app.use(cors({
//   methods: 'GET,POST,PATCH,DELETE,OPTIONS',
//   optionsSuccessStatus: 200,
//   origin: 'http://localhost:1234'
// }));
// app.options('*', cors());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Have Node serve the files for our built React app
app.use(express.static(path.resolve(__dirname, '../frontend/build')));

// Create Users and Attendance table schemas
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, firstname TEXT NOT NULL, lastname TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, token TEXT UNIQUE)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS Attendance (id INTEGER PRIMARY KEY, user_id INTEGER, clock_in TIMESTAMP NOT NULL, clock_out TIMESTAMP, image1 BLOB NOT NULL, image2 BLOB, FOREIGN KEY(user_id) REFERENCES Users(id))"
  );
});

app.post("/register", async (req, res) => {
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
    db.get("SELECT * FROM Users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Error logging in" });
      }
      if (!row) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }
      // Compare passwords
      const isValidPassword = await bcrypt.compare(password, row.password_hash);
      if (!isValidPassword) {
        return res
          .status(401)
          .json({ success: false, message: "Invalid email or password" });
      }
      // Generate token
      const token = jwt.sign(row, secretKey);

      // Check if user already has a token
      if (row.token) {
        // Update existing token
        db.run(
          "UPDATE Users SET token = ? WHERE id = ?",
          [token, row.id],
          (err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ success: false, message: "Error logging in" });
            }
            res.status(200).json({ success: true, token });
          }
        );
      } else {
        // Insert new token
        db.run(
          "UPDATE Users SET token = ? WHERE id = ?",
          [token, row.id],
          (err) => {
            if (err) {
              console.error(err);
              return res
                .status(500)
                .json({ success: false, message: "Error logging in" });
            }
            res.status(200).json({ success: true, token });
          }
        );
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error logging in" });
  }
});

app.get("/logout", (req, res) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return res
      .status(401)
      .json({ success: false, message: "Authorization header is missing" });
  }

  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  db.get("SELECT * FROM Users WHERE token = ?", [token], (err, user) => {
    if (err) {
      console.error(err);
      return res
        .status(500)
        .json({ success: false, message: "Error logging out" });
    }
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    db.run("UPDATE Users SET token = NULL WHERE token = ?", [token], (err) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ success: false, message: "Error logging out" });
      }
      res
        .status(200)
        .json({ success: true, message: "User logged out successfully" });
    });
  });
});

// middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null)
    return res.status(401).json({
      success: false,
      message: "Token Not Found",
    });

  jwt.verify(token, secretKey, (err, user) => {
    if (err)
      return res
        .status(403)
        .json({ success: false, message: "Token Not Verified" });
    req.user = user;
    next();
  });
}

app.get("/verify-token", authenticateToken, (req, res) => {
  const { user } = req;
  db.get("SELECT id FROM Users WHERE token = ?", [user.id], (err, row) => {
    if (err) {
      console.error("Error verifying token:", err);
      return res
        .status(500)
        .json({ success: false, message: "Error verifying token" });
    }
    if (!row) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }
    return res.status(200).json({ success: true, message: "Token is valid" });
  });
});

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

  // Continue with clock-in process
  // Check if the user has any existing attendance records
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? ORDER BY id DESC LIMIT 1",
    [user.id],
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

  // Continue with clock-out process
  // Check if the user has an existing clock-in record
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? AND clock_out IS NULL ORDER BY id DESC LIMIT 1",
    [user.id],
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

// "SELECT * FROM Attendance WHERE user_id = ? ORDER BY clock_in DESC",
//sellect only those filds which are needed
app.get("/attendance-records", authenticateToken, (req, res) => {
  const { user } = req;
  console.log(user.id);
  db.all(
    "SELECT * FROM Attendance WHERE user_id = ? ORDER BY clock_in DESC LIMIT 5",
    [user.id],
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
  db.all("SELECT * FROM Users", (err, data) => {
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
  //if soemone has clocked out yesetrday and logged in today then clock ou will be reset because this api ig getting todays data
  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? ORDER BY clock_in DESC LIMIT 1",
    [user.id],
    (err, data) => {
      if (err) {
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
  const query = `
      SELECT (Users.firstname || " " || Users.lastname) AS fullname, 
             Attendance.clock_in, 
             Attendance.clock_out, 
             Attendance.image1,
             Attendance.image2
      FROM Attendance
      INNER JOIN Users ON Attendance.user_id = Users.id
  `;
  db.all(query, async (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving data from database");
      return;
    }

    // Prepare HTML content
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Data</title>
      </head>
      <body>
        <h1>Attendance Data</h1>
        <table>
          <tr>
            <th>Full Name</th>
            <th>Clock In</th>
            <th>Clock Out</th>
            <th>Image 1</th>
            <th>Image 2</th>
          </tr>
    `;

    // Write rows
    for (const row of rows) {
      const clockIn = moment(row.clock_in);
      const clockOut = moment(row.clock_out);
      const duration = moment.duration(clockOut.diff(clockIn)).humanize();

      // Base64-encoded images from the database
      const base64Image1 = row.image1;
      const base64Image2 = row.image2;

      // Include Base64-encoded images in HTML
      htmlContent += `
        <tr>
          <td>${row.fullname}</td>
          <td>${row.clock_in}</td>
          <td>${row.clock_out}</td>
          <td><img src="${base64Image1}" width="100" height="100"></td>
          <td><img src="${base64Image2}" width="100" height="100"></td>
        </tr>
      `;
    }

    // Close HTML content
    htmlContent += `
        </table>
      </body>
      </html>
    `;

    // Set headers for HTML download
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Content-Disposition", "attachment; filename=data.html");

    // Send HTML response
    res.status(200).send(htmlContent);
  });
});

// db.run("DELETE FROM Attendance", function (err) {
//   if (err) {
//     console.error("Error deleting token:", err.message);
//   } else {
//     console.log("Token deleted from all records successfully.");
//   }
// });

// let backup = db.backup('destDB')
// backup.step(-1);
// backup.finish();

const { google } = require("googleapis");

app.get("/upload", async (req, res) => {
  try {
    // const db = new sqlite3.Database("mydatabase.db");

    // Perform database backup
    const backup = db.backup("db/backup/backup.db");
    backup.step(-1, async (err) => {
      if (err) {
        console.error("Backup failed:", err.message);
        res.status(500).send("Backup failed");
        return;
      }

      console.log("Backup completed successfully!");

      // Google Drive API configuration
      const auth = new google.auth.GoogleAuth({
        keyFile: "google-api-key.json",
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });

      const drive = google.drive({ version: "v3", auth });

      try {
        var currentdate = new Date();
        var filename =
          "Last Sync: " +
          currentdate.getDate() +
          "/" +
          (currentdate.getMonth() + 1) +
          "/" +
          currentdate.getFullYear() +
          " @ " +
          currentdate.getHours() +
          ":" +
          currentdate.getMinutes() +
          ":" +
          currentdate.getSeconds();

        const fileMetadata = {
          name: filename, // Change the filename if needed
          parents: ["1uPWrA3iDKRJyfGHHpXzGEKhH6BX08AMq"], // Change to your desired folder ID
        };

        const filePath = "db/backup/backup.db"; // Path to your database backup file

        const media = {
          mimeType: "application/octet-stream",
          body: fs.createReadStream(filePath),
        };

        const uploadedFile = await drive.files.create({
          resource: fileMetadata,
          media: media,
          fields: "id",
        });

        console.log(
          "File uploaded successfully. File ID:",
          uploadedFile.data.id
        );
        res.status(200).send("File uploaded successfully");
      } catch (error) {
        console.error("Error uploading file:", error);
        res.status(500).send("Error uploading file");
      }
    });

    backup.finish();
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Error occurred");
  }
});

// All other GET requests not handled before will return our React app
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
