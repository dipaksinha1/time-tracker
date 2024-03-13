const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const cors = require("cors");
const fs = require("fs");
const csvWriter = require("csv-write-stream");
const moment = require("moment");

const app = express();
const PORT = process.env.PORT || 3000;
const secretKey =
  "026ac46d4fdee9633aba8e8506aff802d4c898afe253de91081d6a695edab0ba"; //Put this in env file
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

// Create Users and Attendance table schemas
db.serialize(() => {
  db.run(
    "CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, firstname TEXT NOT NULL, lastname TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, token TEXT UNIQUE)"
  );
  db.run(
    "CREATE TABLE IF NOT EXISTS Attendance (id INTEGER PRIMARY KEY, user_id INTEGER, clock_in TIMESTAMP NOT NULL, clock_out TIMESTAMP, FOREIGN KEY(user_id) REFERENCES Users(id))"
  );
});

app.post("/register", async (req, res) => {
  const { firstname, lastname, email, password } = req.body;
  try {
    // Check if email already exists
    db.get("SELECT * FROM Users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error registering user");
      }
      if (row) {
        // Email already exists
        return res.status(400).send("Email already exists");
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
            return res.status(500).send("Error registering user");
          }
          res.status(201).send("User registered successfully");
        }
      );
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error registering user");
  }
});

app.post("/login", async (req, res) => {
  const email = req.body.email;
  const password = req.body.password;
  try {
    db.get("SELECT * FROM Users WHERE email = ?", [email], async (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error logging in");
      }
      if (!row) {
        return res.status(401).send("Invalid email or password");
      }
      // Compare passwords
      const isValidPassword = await bcrypt.compare(password, row.password_hash);
      if (!isValidPassword) {
        return res.status(401).send("Invalid email or password");
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
              return res.status(500).send("Error logging in");
            }
            res.status(200).json({ token });
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
              return res.status(500).send("Error logging in");
            }
            res.status(200).json({ token });
          }
        );
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Error logging in");
  }
});

app.get("/logout", (req, res) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader) {
    return res.status(401).send("Authorization header is missing");
  }

  const token = req.headers.authorization.split(" ")[1];

  if (!token) {
    return res.status(401).send("Invalid token");
  }

  db.get("SELECT * FROM Users WHERE token = ?", [token], (err, user) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error logging out");
    }
    if (!user) {
      return res.status(401).send("Invalid token");
    }

    db.run("UPDATE Users SET token = NULL WHERE token = ?", [token], (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error logging out");
      }
      res.status(200).send("User logged out successfully");
    });
  });
});

// middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (token == null) return res.sendStatus(401);

  jwt.verify(token, secretKey, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

//add-clock in only if last record was clock out or 1st one
app.post("/clock-in", authenticateToken, (req, res) => {
  const { user } = req;
  const clientTimestamp = req.body.timestamp; //add function to check time difference of 5-10 seconds
  const currentTime = new Date().toISOString();
  db.run(
    "INSERT INTO Attendance (user_id, clock_in) VALUES (?, ?)",
    [user.id, currentTime],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error clocking in");
      }
      res.status(200).send("Clock-in successful");
    }
  );
});

//add-clock out only if last record was clock in
app.post("/clock-out", authenticateToken, (req, res) => {
  const { user } = req;
  console.log(user);
  const clientTimestamp = req.body.timestamp; //add function to check time difference of 5-10 seconds
  console.log(clientTimestamp);
  const currentTime = new Date().toISOString();
  db.run(
    "UPDATE Attendance SET clock_out = ? WHERE user_id = ? AND clock_out IS NULL",
    [currentTime, user.id],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error clocking out");
      }
      res.status(200).send("Clock-out successful");
    }
  );
});

// "SELECT * FROM Attendance WHERE user_id = ? ORDER BY clock_in DESC",
app.get("/attendance-records", authenticateToken, (req, res) => {
  const { user } = req;
  console.log(user.id);
  db.all(
    "SELECT * FROM Attendance WHERE user_id = ? ORDER BY clock_in DESC",
    [user.id],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error retrieving attendance records");
      }
      res.status(200).json({ attendance_records: rows });
    }
  );
});

app.get("/get-all", (req, res) => {
  db.all("SELECT * FROM Users", (err, data) => {
    if (err) {
      console.error(err);
      return res.status(500).send("Error retrieving attendance records");
    }
    res.status(200).json(data);
  });
});

app.get("/last-attendance", authenticateToken, (req, res) => {
  const { user } = req;

  db.get(
    "SELECT * FROM Attendance WHERE user_id = ? AND DATE(clock_in) = DATE('now', 'localtime') ORDER BY id DESC LIMIT 1",
    [user.id],
    (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error retrieving attendance records");
      }
      res.status(200).json(data);
    }
  );
});

app.get("/user-fullname", authenticateToken, (req, res) => {
  const { user } = req;

  db.get(
    "SELECT firstname || ' ' || lastname AS fullName FROM Users WHERE id = ?",[user.id],
    (err, data) => {
      if (err) {
        console.error(err);
        return res.status(500).send("Error retrieving user full name");
      }
      res.status(200).json(data);
    }
  );
});

app.get("/users", (req, res) => {
  const query =
    'SELECT (firstname || " " || lastname) AS fullname, email FROM Users';
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    console.log(rows);
    res.status(200).json(rows);
  });
});

// app.get("/exportcsv", (req, res) => {
//   // Query data from SQLite3 database
//   const query = `

//   `;
//   db.all(query, (err, rows) => {
//     if (err) {
//       console.error(err);
//       res.status(500).send("Error retrieving data from database");
//       return;
//     }
//     console.log(rows)
//     res.json(rows)
//   });
// });

app.get("/exportcsv", (req, res) => {
  // Query data from SQLite3 database
  const query = `
      SELECT (Users.firstname || " " || Users.lastname) AS fullname, Attendance.clock_in, Attendance.clock_out
      FROM Attendance
      INNER JOIN Users ON Attendance.user_id = Users.id
  `;
  db.all(query, (err, rows) => {
    if (err) {
      console.error(err);
      res.status(500).send("Error retrieving data from database");
      return;
    }

    // Convert data to CSV format
    const writer = csvWriter({
      headers: ["Full Name", "Clock In", "Clock Out", "Duration"],
    });
    const filePath = "attendance.csv"; // Name your CSV file
    writer.pipe(fs.createWriteStream(filePath)); // Pipe data to file

    // Write rows
    rows.forEach((row) => {
      const clockIn = moment(row.clock_in);
      const clockOut = moment(row.clock_out);
      const duration = moment.duration(clockOut.diff(clockIn)).humanize();

      writer.write([row.fullname, row.clock_in, row.clock_out, duration]);
    });

    writer.end();

    // Respond with CSV file
    res.setHeader("Content-Type", "text/csv");
    res.download(filePath, "attendance.csv", (err) => {
      if (err) {
        console.error(err);
        res.status(500).send("Error sending CSV file");
      } else {
        console.log("CSV file sent successfully");
        // Delete the CSV file after sending
        fs.unlink(filePath, (err) => {
          if (err) console.error(err);
          else console.log("CSV file deleted");
        });
      }
    });
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
        const fileMetadata = {
          name: "backup.db", // Change the filename if needed
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

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
