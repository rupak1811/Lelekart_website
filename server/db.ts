import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

// Direct database URL configuration
const DATABASE_URL = "postgresql://neondb_owner:npg_K8U1fgacsxJM@ep-odd-frog-a1ymeega-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

export const pool = new Pool({ connectionString: DATABASE_URL });
export const db = drizzle({ client: pool, schema });