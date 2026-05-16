import mongoose from "mongoose";

const userSchema = mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    watchlist: [
        {
            mediaId: { type: Number, required: true },
            mediaType: { type: String, enum: ["movie", "tv"], required: true },
            title: { type: String },
            poster_path: { type: String },
            release_date: { type: String },
        }
    ],
    watchHistory: [
        {
            mediaId: { type: Number, required: true },
            mediaType: { type: String, enum: ["movie", "tv"], required: true },
            title: { type: String },
            poster_path: { type: String },
            release_date: { type: String },
            watchedAt: { type: Date, default: Date.now },
        }
    ]
});

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;