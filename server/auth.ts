import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || "default-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.HTTPS === 'true',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    },
    // Add session error handling
    genid: () => {
      return randomBytes(16).toString('hex');
    },
  };

  // Add session store error handling
  storage.sessionStore.on('error', (error) => {
    console.error('❌ Session store error:', error);
  });

  storage.sessionStore.on('disconnect', () => {
    console.warn('⚠️ Session store disconnected');
  });

  storage.sessionStore.on('connect', () => {
    console.log('✅ Session store connected');
  });

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  // Add middleware to handle passport errors gracefully
  app.use((err: any, req: any, res: any, next: any) => {
    if (err && err.message && err.message.includes('Failed to deserialize user')) {
      console.log('🔄 Clearing invalid session due to deserialization error');
      req.logout((logoutErr: any) => {
        if (logoutErr) {
          console.error('❌ Error during logout after deserialization failure:', logoutErr);
        }
        // Clear the session
        req.session.destroy(() => {
          res.clearCookie('connect.sid');
          next();
        });
      });
    } else {
      next(err);
    }
  });

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    if (!user || !user.id) {
      return done(new Error('User object is invalid for serialization'), false);
    }
    done(null, user.id);
  });
  
  passport.deserializeUser(async (id: string, done) => {
    try {
      // Handle cases where id might be null, undefined, or invalid
      if (!id || typeof id !== 'string') {
        console.log(`⚠️ Invalid user ID in session: ${id}`);
        return done(null, false);
      }

      const user = await storage.getUser(id);
      if (!user) {
        console.log(`⚠️ User not found in database for ID: ${id}`);
        return done(null, false);
      }
      
      // Throttle deserialization logs to prevent spam
      if (!global.authLogThrottle) global.authLogThrottle = new Map();
      const lastLog = global.authLogThrottle.get(`user-deserialized-${user.id}`) || 0;
      if (Date.now() - lastLog > 30000) { // Log once per 30 seconds per user
        console.log(`✅ User deserialized successfully: ${user.username} (${user.id})`);
        global.authLogThrottle.set(`user-deserialized-${user.id}`, Date.now());
      }
      done(null, user);
    } catch (error) {
      console.error('❌ Error during user deserialization:', error);
      // Instead of passing the error, return false to clear the session
      done(null, false);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      console.log(`🔐 Registration attempt for username: ${req.body.username}, email: ${req.body.email}`);
      
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log(`⚠️ Username ${req.body.username} already exists`);
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        console.log(`⚠️ Email ${req.body.email} already exists`);
        return res.status(400).json({ error: "Email already exists" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      console.log(`✅ User created successfully: ${user.username} (${user.id})`);

      req.login(user, (err) => {
        if (err) {
          console.error('❌ Auto-login after registration failed:', err);
          return next(err);
        }
        console.log(`🔐 User ${user.username} auto-logged in after registration`);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('❌ Registration error:', error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log(`🔐 Login attempt for username: ${req.body.username}`);
    
    passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) {
        console.error('❌ Login error:', err);
        return next(err);
      }
      
      if (!user) {
        console.log(`⚠️ Login failed for username: ${req.body.username}`);
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      req.logIn(user, (err) => {
        if (err) {
          console.error('❌ Session creation failed:', err);
          return next(err);
        }
        
        console.log(`✅ User ${user.username} (${user.id}) logged in successfully`);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        console.log('🔐 User check: not authenticated');
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      if (!req.user) {
        console.log('🔐 User check: no user object in session');
        return res.status(401).json({ error: "Invalid session" });
      }
      
      console.log(`🔐 User check: authenticated as ${req.user?.username} (${req.user?.id})`);
      res.json(req.user);
    } catch (error) {
      console.error('❌ Error in /api/user:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add a middleware to catch any remaining authentication errors
  app.use('/api', (err: any, req: any, res: any, next: any) => {
    if (err && (
      err.message?.includes('deserialize') || 
      err.message?.includes('session') ||
      err.message?.includes('passport')
    )) {
      console.log('🔄 Clearing session due to authentication error:', err.message);
      
      // Clear the session and respond with 401
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.status(401).json({ error: "Session expired, please login again" });
      });
    } else {
      next(err);
    }
  });

  return sessionSettings;
}
