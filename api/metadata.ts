import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db } from '/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Check Auth Cookie
  const { session_token } = req.cookies;
  if (session_token !== process.env.SESSION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // 2. GET Request: Fetch all folders and files
    if (req.method === 'GET') {
      const foldersResult = await db.execute('SELECT * FROM folders');
      const filesResult = await db.execute('SELECT * FROM files');

      // Turso returns rows as objects matching the column names
      // We parse the 'iv' field from JSON string back to array for the frontend
      const files = filesResult.rows.map((row: any) => ({
        ...row,
        iv: typeof row.iv === 'string' ? JSON.parse(row.iv) : row.iv
      }));

      return res.status(200).json({ 
        folders: foldersResult.rows, 
        files: files 
      });
    }

    // 3. POST Request: Create data
    if (req.method === 'POST') {
      const { type, data } = req.body;

      if (type === 'create_folder') {
        await db.execute({
          sql: 'INSERT INTO folders (id, name) VALUES (?, ?)',
          args: [data.id, data.name],
        });
        return res.status(200).json({ success: true });
      }
      
      if (type === 'add_file') {
        // We store the IV as a JSON string because SQLite doesn't have a native array type
        await db.execute({
          sql: 'INSERT INTO files (id, folderId, name, size, type, created, iv) VALUES (?, ?, ?, ?, ?, ?, ?)',
          args: [
            data.id, 
            data.folderId, 
            data.name, 
            data.size, 
            data.type, 
            data.created, 
            JSON.stringify(data.iv) // Serialize IV array
          ],
        });
        return res.status(200).json({ success: true });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (error) {
    console.error('Database Error:', error);
    return res.status(500).json({ error: 'Database operation failed' });
  }
}