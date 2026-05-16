import express from "express";
import mongoose from "mongoose";
import { connectToDB } from "./config/db.js";
import dotenv from "dotenv";
import User from "./models/user.model.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken"
import cookieParser from "cookie-parser";
import cors from "cors";

dotenv.config();

const app = express();

//Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_URL, 
    credentials: true
}))

const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.send("Chobbighor!")
});

app.get("/api/ping", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.get("/api/health", (req, res) => {
  const states = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };
  res.status(200).json({
    server: "ok",
    database: states[mongoose.connection.readyState],
    timestamp: new Date().toISOString(),
  });
});

// Auth middleware — reuse across routes
const authMiddleware = (req, res, next) => {
    const { token } = req.cookies;
    if (!token) return res.status(401).json({ message: "Not authenticated." });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        next();
    } catch {
        return res.status(401).json({ message: "Invalid token." });
    }
};

app.post("/api/signup", async (req, res) => {
    const { username, email, password } = req.body;

    try {
        if(!username || !email || !password){
            throw new Error("All fields are required!")
        }        

        const emailExists = await User.findOne({ email });

        if(emailExists){
            return res.status(400).json({
                message: "User already exists."
            })
        }

        const usernameExists = await User.findOne({ username });

         if(usernameExists){
            return res.status(400).json({
                message: "Username is taken, try another name."
            })
        }

        const hashedPassword = await bcryptjs.hash(password, 10)

        const userDoc = await User.create({
            username,
            email,
            password: hashedPassword,
        });

        //JWT
        if(userDoc){
            //jwt.sign(payload, secret, options)
            const token = jwt.sign({id: userDoc._id}, process.env.JWT_SECRET, {
                expiresIn: "7d"
            });

            res.cookie("token", token, {
                httpOnly: true,
                secure: true,
                sameSite: "none"
            })
        }


        return res.status(200).json({
        user: userDoc, message:"User created Successfully."
    });
    } catch (error) {
        
        res.status(400).json({
            message: error.message 
        })
    }

})

app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;

    try {
        const userDoc = await User.findOne({ username });
        if(!userDoc){
            return res.status(400).json({
                message: "Invalid credentials."
            });
        }

        const isPasswordValid = await bcryptjs.compareSync(
            password, 
            userDoc.password
        );
        if(!isPasswordValid){
             return res.status(400).json({
                message: "Invalid credentials."
            });
        }

        //JWT
         
        if(userDoc){
            //jwt.sign(payload, secret, options)
            const token = jwt.sign({id: userDoc._id}, process.env.JWT_SECRET, {
                expiresIn: "7d"
            });

            res.cookie("token", token, {
                httpOnly: true,
                secure: true,
                sameSite: "none"
            })
        }


        return res.status(200).json({
        user: userDoc, message:"Logged in Successfully."
    });
    } catch (error) {
        console.log("Error logging in", error.message);
        
        res.status(400).json({
            message: error.message 
        })
    }
});

app.get("/api/fetch-user", async (req, res) => {
    const { token } = req.cookies;

    if(!token){
        return res.status(401).json({
            message: "No token provided."
        })
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if(!decoded){
            return res.status(402).json({
                message: "Invalid token"
            });
        }

        const userDoc = await User.findById(decoded.id).select("-password");

        if(!userDoc){
            return res.status(400).json({
                message: "No user found."
            });
        }

        res.status(200).json({
            user: userDoc
        })
    } catch (error) {
        console.log("Error in fetching user: ", error.message);
        return res.status(400).json({
            message: error.message
        });
    }
});

app.post("/api/logout", async (req, res) => {
    res.clearCookie("token", {
  httpOnly: true,
  secure: true,
  sameSite: "none"
});
    res.status(200).json({
        message: "Logged out successfully"
    })
});



// Add to watchlist
app.post("/api/watchlist/add", authMiddleware, async (req, res) => {
    const { mediaId, mediaType, title, poster_path, release_date } = req.body;

    try {
        const user = await User.findById(req.userId);

        // Check if already saved
        const alreadySaved = user.watchlist.some(
            (item) => item.mediaId === mediaId && item.mediaType === mediaType
        );

        if (alreadySaved) {
            return res.status(400).json({ message: "Already in watchlist." });
        }

        user.watchlist.push({ mediaId, mediaType, title, poster_path, release_date });
        await user.save();

        return res.status(200).json({ message: "Added to watchlist.", watchlist: user.watchlist });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Remove from watchlist
app.post("/api/watchlist/remove", authMiddleware, async (req, res) => {
    const { mediaId, mediaType } = req.body;

    try {
        const user = await User.findById(req.userId);
        user.watchlist = user.watchlist.filter(
            (item) => !(item.mediaId === mediaId && item.mediaType === mediaType)
        );
        await user.save();

        return res.status(200).json({ message: "Removed from watchlist.", watchlist: user.watchlist });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Get watchlist
app.get("/api/watchlist", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("watchlist");
        return res.status(200).json({ watchlist: user.watchlist });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Clear entire watchlist
app.delete("/api/watchlist/clear", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        user.watchlist = [];
        await user.save();
        return res.status(200).json({ message: "Watchlist cleared." });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Add to watch history 
app.post("/api/history/add", authMiddleware, async (req, res) => {
    const { mediaId, mediaType, title, poster_path, release_date } = req.body;

    try {
        const user = await User.findById(req.userId);

        // Remove existing entry for same media (to re-add it fresh at top)
        user.watchHistory = user.watchHistory.filter(
            (item) => !(item.mediaId === mediaId && item.mediaType === mediaType)
        );

        // Add to front of array so most recent is first
        user.watchHistory.unshift({
            mediaId,
            mediaType,
            title,
            poster_path,
            release_date,
            watchedAt: new Date(),
        });

        // Keep only last 50 entries
        if (user.watchHistory.length > 50) {
            user.watchHistory = user.watchHistory.slice(0, 50);
        }

        await user.save();

        return res.status(200).json({ message: "Added to history.", watchHistory: user.watchHistory });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Get watch history
app.get("/api/history", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("watchHistory");
        return res.status(200).json({ watchHistory: user.watchHistory });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Remove single item from history
app.post("/api/history/remove", authMiddleware, async (req, res) => {
    const { mediaId, mediaType } = req.body;

    try {
        const user = await User.findById(req.userId);
        user.watchHistory = user.watchHistory.filter(
            (item) => !(item.mediaId === mediaId && item.mediaType === mediaType)
        );
        await user.save();

        return res.status(200).json({ message: "Removed from history.", watchHistory: user.watchHistory });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});

// Clear entire watch history
app.delete("/api/history/clear", authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        user.watchHistory = [];
        await user.save();

        return res.status(200).json({ message: "History cleared." });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
});


// Update username
app.put("/api/user/update-username", authMiddleware, async (req, res) => {
  const { username } = req.body;
  try {
    const taken = await User.findOne({ username });
    if (taken) return res.status(400).json({ message: "Username already taken." });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { username },
      { new: true }
    ).select("-password");

    return res.status(200).json({ user, message: "Username updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Update email
app.put("/api/user/update-email", authMiddleware, async (req, res) => {
  const { email } = req.body;
  try {
    const taken = await User.findOne({ email });
    if (taken) return res.status(400).json({ message: "Email already in use." });

    const user = await User.findByIdAndUpdate(
      req.userId,
      { email },
      { new: true }
    ).select("-password");

    return res.status(200).json({ user, message: "Email updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Update password
app.put("/api/user/update-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  try {
    const user = await User.findById(req.userId);
    const isValid = await bcryptjs.compare(currentPassword, user.password);
    if (!isValid) return res.status(400).json({ message: "Current password is incorrect." });

    user.password = await bcryptjs.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Delete account
app.delete("/api/user/delete-account", authMiddleware, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.userId);
    res.clearCookie("token", {
  httpOnly: true,
  secure: true,
  sameSite: "none"
});
    return res.status(200).json({ message: "Account deleted successfully." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.listen(PORT, () => {
    connectToDB();
    console.log(`Server is running on http://localhost:${PORT}`);
    
})
