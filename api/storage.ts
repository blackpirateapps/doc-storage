import type { VercelRequest, VercelResponse } from '@vercel/node';
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Check Auth Cookie
  const { session_token } = req.cookies;
  if (session_token !== process.env.SESSION_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { filename, fileType, operation } = req.body;

    if (operation === 'upload') {
      const command = new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
        ContentType: fileType,
      });
      const url = await getSignedUrl(R2, command, { expiresIn: 3600 });
      return res.status(200).json({ url });
    } 
    
    else if (operation === 'download') {
      const command = new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
      });
      const url = await getSignedUrl(R2, command, { expiresIn: 3600 });
      return res.status(200).json({ url });
    }

    return res.status(400).json({ error: 'Invalid operation' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Storage Access Failed' });
  }
}