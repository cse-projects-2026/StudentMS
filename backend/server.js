const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const pool = require("./db");
require("dotenv").config();
const nodemailer = require("nodemailer");
const emailjs = require("@emailjs/nodejs");
const crypto = require("crypto");

const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
// JWT Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            error: "Access token required."
        });
    }

    const jwt = require("jsonwebtoken");

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                error: "Invalid or expired token."
            });
        }

        req.user = user;
        next();
    });
}
// Allow only Admin accounts
function requireAdmin(req, res, next) {
    if (req.user.role !== "admin") {
        return res.status(403).json({
            error: "Admin access required."
        });
    }

    next();
}
app.use(express.urlencoded({ extended: true }));

// Home route
app.get("/", (req, res) => {
    res.send("Student Management Backend is running!");
});

// Test PostgreSQL connection
app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                current_database() AS database_name,
                current_user AS database_user,
                to_regclass('public.password_reset_tokens') AS reset_table
        `);

        res.json({
            message: "PostgreSQL connected successfully!",
            ...result.rows[0]
        });
    } catch (error) {
        console.error("Database error:", error.message);
        res.status(500).json({
            error: error.message
        });
    }
});
// Register a new student
app.post("/api/register", async (req, res) => {
    try {
        const { name, email, password, fee, courses } = req.body;
        const role = "student";

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            password.length < 8
        ) {
            return res.status(400).json({
                error: "Enter your name, email and a password of at least 8 characters."
            });
        }

        const studentFee = fee === undefined ? 0 : Number(fee);

        if (!Number.isFinite(studentFee) || studentFee < 0) {
            return res.status(400).json({
                error: "Fee must be a valid non-negative number."
            });
        }

        if (
            courses !== undefined &&
            typeof courses !== "string"
        ) {
            return res.status(400).json({
                error: "Courses must be text."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO users
                (name, email, password_hash, is_active, fee, courses, role)
            VALUES($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, name, email, is_active, fee, courses`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                passwordHash,
                true,
                studentFee,
                courses ?? "",
                role
            ]
        );

        res.status(201).json({
            message: "Registration successful!",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        console.error("Registration error:", error.message);
        res.status(500).json({
            error: "Registration failed."
        });
    }
});

// Start server
const PORT = process.env.PORT || 3000;

app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");
        res.json({
            message: "PostgreSQL connected successfully!",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error("Database error:", error.message);
        res.status(500).json({
            error: "Database connection failed"
        });
    }
});

// LOGIN ROUTE
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "Email and password are required."
            });
        }

        // Find user in PostgreSQL
        const result = await pool.query(
            `SELECT id, name, email, 
        password_hash, is_active, role
            FROM public.users
            WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        const user = result.rows[0];

        // Check account status
        if (!user.is_active) {
            return res.status(403).json({
                error: "Your account is inactive."
            });
        }

        // Verify password
        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: "Invalid email or password."
            });
        }

        // JWT is required for protected dashboard APIs
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing from .env");
            return res.status(500).json({
                error: "Server authentication is not configured."
            });
        }

        const jwt = require("jsonwebtoken");

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );
        return res.json({
            message: "Login successful.",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            error: "Login failed due to a server error."
        });
    }
});
// GET ALL USERS
app.get("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, is_active, fee, courses
             FROM public.users
             WHERE role = 'student'
             ORDER BY id DESC`
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Fetch users error:", error.message);
        res.status(500).json({
            error: "Failed to fetch users."
        });
    }
});

// ADD STUDENT - Protected Route
app.post("/api/users", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name, email, password, fee, courses } = req.body;

        if (
            typeof name !== "string" ||
            typeof email !== "string" ||
            typeof password !== "string" ||
            !name.trim() ||
            !email.trim() ||
            password.length < 8
        ) {
            return res.status(400).json({
                error: "Name, email and password (at least 8 characters) are required."
            });
        }

        const studentFee = fee === undefined ? 0 : Number(fee);

        if (!Number.isFinite(studentFee) || studentFee < 0) {
            return res.status(400).json({
                error: "Fee must be a valid non-negative number."
            });
        }

        if (courses !== undefined && typeof courses !== "string") {
            return res.status(400).json({
                error: "Courses must be text."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const result = await pool.query(
            `INSERT INTO public.users
                (name, email, password_hash, is_active, fee, courses)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, name, email, is_active, fee, courses`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                passwordHash,
                true,
                studentFee,
                courses ?? ""
            ]
        );

        return res.status(201).json({
            message: "Student added successfully!",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        console.error("Add student error:", error.message);

        return res.status(500).json({
            error: "Failed to add student."
        });
    }
});

// UPDATE STUDENT - Protected Route
app.put("/api/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { name, email, fee, courses, is_active } = req.body;

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({ error: "Invalid student ID." });
        }

        if (
            typeof name !== "string" || !name.trim() ||
            typeof email !== "string" || !email.trim()
        ) {
            return res.status(400).json({
                error: "Name and email are required."
            });
        }

        const studentFee = Number(fee);

        if (
            fee === undefined ||
            fee === null ||
            String(fee).trim() === "" ||
            !Number.isFinite(studentFee) ||
            studentFee < 0
        ) {
            return res.status(400).json({
                error: "Fee must be a valid non-negative number."
            });
        }

        if (typeof courses !== "string" || typeof is_active !== "boolean") {
            return res.status(400).json({
                error: "Valid courses and account status are required."
            });
        }

        const result = await pool.query(
            `UPDATE public.users
             SET name = $1,
                 email = $2,
                 fee = $3,
                 courses = $4,
                 is_active = $5
             WHERE id = $6
             RETURNING id, name, email, is_active, fee, courses`,
            [
                name.trim(),
                email.trim().toLowerCase(),
                studentFee,
                courses.trim(),
                is_active,
                id
            ]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                error: "Student not found."
            });
        }

        return res.json({
            message: "Student updated successfully!",
            user: result.rows[0]
        });

    } catch (error) {
        if (error.code === "23505") {
            return res.status(409).json({
                error: "This email is already registered."
            });
        }

        console.error("Update student error:", error.message);

        return res.status(500).json({
            error: "Failed to update student."
        });
    }
});


// DELETE STUDENT - Protected Route
app.delete("/api/users/:id", authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                error: "Invalid student ID."
            });
        }

        const result = await pool.query(
            `DELETE FROM public.users
             WHERE id = $1
             RETURNING id, name, email`,
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                error: "Student not found."
            });
        }

        return res.json({
            message: "Student deleted successfully.",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Delete student error:", error.message);

        return res.status(500).json({
            error: "Failed to delete student."
        });
    }
});

// GET LOGGED-IN STUDENT'S OWN PROFILE
app.get("/api/student/profile", authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, courses, fee, is_active
             FROM public.users
             WHERE id = $1 AND role = 'student'`,
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Student profile not found."
            });
        }

        return res.json(result.rows[0]);

    } catch (error) {
        console.error("Student profile error:", error.message);

        return res.status(500).json({
            error: "Failed to load student profile."
        });
    }
});

// FORGOT PASSWORD - REQUEST RESET LINK
app.post("/api/forgot-password", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
        return res.status(400).json({
            error: "Please enter your email address."
        });
    }

    let resetToken;

    try {
        const result = await pool.query(
            `SELECT id, email
             FROM public.users
             WHERE LOWER(email) = $1`,
            [email]
        );

        // Use the same response whether the account exists or not.
        const message =
            "If an account exists for this email, a reset link will be sent.";

        if (result.rows.length === 0) {
            return res.json({ message });
        }

        const user = result.rows[0];

        // Generate a secure token; store only its SHA-256 hash.
        resetToken = crypto.randomBytes(32).toString("hex");

        const tokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // Invalidate previous unused reset links for this user.
        await pool.query(
            `UPDATE public.password_reset_tokens
             SET used_at = NOW()
             WHERE user_id = $1 AND used_at IS NULL`,
            [user.id]
        );

        // Token expires in 15 minutes.
        await pool.query(
            `INSERT INTO public.password_reset_tokens
             (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
            [user.id, tokenHash]
        );

        const resetUrl =
            `${process.env.APP_BASE_URL}/reset_password.html?token=${resetToken}`;

        console.log("Private key loaded:", !!process.env.EMAILJS_PRIVATE_KEY);
        await emailjs.send(
            process.env.EMAILJS_SERVICE_ID,
            process.env.EMAILJS_TEMPLATE_ID,
            {
                to_email: user.email,
                reset_link: resetUrl
            },
            {
                publicKey: process.env.EMAILJS_PUBLIC_KEY,
                privateKey: process.env.EMAILJS_PRIVATE_KEY
            }
        );

        return res.json({ message });

    } catch (error) {
        console.error("Forgot password error:", error);

        // Invalidate a newly created token if email delivery fails.
        if (resetToken) {
            const tokenHash = crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

            try {
                await pool.query(
                    `UPDATE public.password_reset_tokens
                     SET used_at = NOW()
                     WHERE token_hash = $1 AND used_at IS NULL`,
                    [tokenHash]
                );
            } catch (cleanupError) {
                console.error(
                    "Reset token cleanup error:",
                    cleanupError.message
                );
            }
        }

        return res.status(500).json({
            error: "Unable to send the reset email right now. Please try again later."
        });
    }
});

// RESET PASSWORD
app.post("/api/reset-password", async (req, res) => {
    const token = String(req.body.token || "").trim();
    const newPassword = req.body.newPassword;

    if (!token || !newPassword || typeof newPassword !== "string") {
        return res.status(400).json({
            error: "Reset token and new password are required."
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            error: "Password must be at least 8 characters long."
        });
    }

    if (token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
        return res.status(400).json({
            error: "Invalid or expired reset link."
        });
    }

    const tokenHash = crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT id, user_id
             FROM public.password_reset_tokens
             WHERE token_hash = $1
               AND used_at IS NULL
               AND expires_at > NOW()
             FOR UPDATE`,
            [tokenHash]
        );

        if (result.rows.length === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                error: "Invalid or expired reset link. Please request a new one."
            });
        }

        const resetRecord = result.rows[0];

        const passwordHash = await bcrypt.hash(newPassword, 12);

        await client.query(
            `UPDATE public.users
             SET password_hash = $1
             WHERE id = $2`,
            [passwordHash, resetRecord.user_id]
        );

        await client.query(
            `UPDATE public.password_reset_tokens
             SET used_at = NOW()
             WHERE user_id = $1
               AND used_at IS NULL`,
            [resetRecord.user_id]
        );

        await client.query("COMMIT");

        return res.json({
            message: "Password reset successful. You can now log in with your new password."
        });

    } catch (error) {
        await client.query("ROLLBACK");

        console.error("Reset password error:", error.message);

        return res.status(500).json({
            error: "Failed to reset password. Please try again."
        });

    } finally {
        client.release();
    }
});



app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
