import session from "express-session";
import connectPg from "connect-pg-simple";
import nodemailer from "nodemailer";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

// Hardcoded configuration for development
const CONFIG = {
  DATABASE_URL: "postgresql://neondb_owner:npg_K8U1fgacsxJM@ep-odd-frog-a1ymeega-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  SESSION_SECRET: "univendorpro-secret-key-123",
  SMTP: {
    host: "smtp.gmail.com",
    port: 587,
    user: "rupakchimakurthi1811@gmail.com",
    pass: "uupz ddry cmph kwaf"
  }
};

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: CONFIG.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  return session({
    secret: CONFIG.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // Set to false for development
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  });
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const session = req.session as any;
  const userId = session?.userId;
  
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Handle impersonation
    let effectiveUser = user;
    let isImpersonating = false;
    
    if (session.impersonatedUserId && session.originalUserId) {
      // Check if the original user has admin privileges
      const originalUser = await storage.getUser(session.originalUserId);
      if (originalUser && (originalUser.role === 'super_admin' || originalUser.role === 'admin')) {
        const impersonatedUser = await storage.getUser(session.impersonatedUserId);
        if (impersonatedUser) {
          effectiveUser = impersonatedUser;
          isImpersonating = true;
        }
      }
    }
    
    // Structure the user object to match expected format
    (req as any).user = {
      claims: {
        sub: effectiveUser.id.toString(),
        email: effectiveUser.email,
        role: effectiveUser.role
      },
      userData: effectiveUser,
      originalUser: isImpersonating ? user : null,
      isImpersonating
    };
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};

// Email service for sending OTP
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: CONFIG.SMTP.host,
      port: CONFIG.SMTP.port,
      secure: false,
      auth: {
        user: CONFIG.SMTP.user,
        pass: CONFIG.SMTP.pass,
      },
    });
    console.log("Email service initialized");
  }

  async sendOTP(email: string, code: string): Promise<boolean> {
    try {
      // Log the OTP for development/testing purposes
      console.log(`=== EMAIL OTP ===`);
      console.log(`To: ${email}`);
      console.log(`Subject: Your verification code`);
      console.log(`Code: ${code}`);
      console.log(`================`);

      // Send the actual email
      await this.transporter.sendMail({
        from: CONFIG.SMTP.user,
        to: email,
        subject: "Your verification code",
        text: `Your verification code is: ${code}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Your Verification Code</h2>
            <p>Please use the following code to verify your email address:</p>
            <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
              ${code}
            </div>
            <p>This code will expire in 5 minutes.</p>
          </div>
        `,
      });

      return true;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  }
}

export const emailService = new EmailService();

// Generate 6-digit OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}