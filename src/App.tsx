import React, { useState } from 'react';
import { 
  Folder, FileText, Lock, 
  Plus, 
  X, ShieldCheck, UploadCloud
} from 'lucide-react';
import { generateId, encryptData, decryptData } from './lib/crypto';

// --- COMPONENTS ---
const Modal = ({ isOpen, onClose, children, title }: any) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X size={20} className="text-gray-500" />
          </button>
        </div>
        <div className="p-0 overflow-y-auto max-h-[80vh]">{children}</div>
      </div>
    </div>
  );
};

export default function App() {
  // Auth State
  const [appPassword, setAppPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [vaultPassword, setVaultPassword] = useState('');
  const [isVaultUnlocked, setIsVaultUnlocked] = useState(false);
  
  // Data State
  const [folders, setFolders] = useState<{id: string, name: string}[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // UI State
  const [activeFile, setActiveFile] = useState<any>(null);
  const [decryptedBlobUrl, setDecryptedBlobUrl] = useState<string | null>(null);
  const [resizePercent, setResizePercent] = useState(50);

  // --- ACTIONS ---

  const refreshData = async () => {
    try {
      const res = await fetch('/api/metadata');
      if (res.ok) {
        const data = await res.json();
        setFolders(data.folders);
        setFiles(data.files);
      }
    } catch (e) {
      console.error("Failed to fetch metadata", e);
    }
  };

  const handleAppLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: appPassword })
      });
      
      if (res.ok) {
        setIsAuthenticated(true);
        refreshData();
      } else {
        alert("Incorrect App Password");
      }
    } catch (err) {
      alert("Login Error");
    } finally {
      setLoading(false);
    }
  };

  const handleVaultUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (vaultPassword.length > 0) setIsVaultUnlocked(true);
  };

  const createFolder = async () => {
    const name = prompt("Folder Name:");
    if (!name) return;
    
    const newFolder = { id: generateId(), name };
    setFolders([...folders, newFolder]); // Optimistic
    
    await fetch('/api/metadata', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'create_folder', data: newFolder })
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setLoading(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const buffer = await file.arrayBuffer();
        
        // 1. Client-Side Encryption
        const { iv, content } = await encryptData(buffer, vaultPassword);
        
        // 2. Get Presigned URL
        const filename = generateId(); 
        const presignRes = await fetch('/api/storage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, fileType: 'application/octet-stream', operation: 'upload' })
        });
        const { url } = await presignRes.json();

        // 3. Upload directly to Cloudflare R2
        await fetch(url, { method: 'PUT', body: content });

        // 4. Save Metadata
        const newFile = {
          id: filename,
          folderId: currentFolderId,
          name: file.name,
          size: file.size,
          type: file.type,
          created: new Date().toISOString(),
          iv: iv 
        };
        
        await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'add_file', data: newFile })
        });
        
        setFiles(prev => [...prev, newFile]);
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const handleFileClick = async (file: any) => {
    setLoading(true);
    try {
      const res = await fetch('/api/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.id, operation: 'download' })
      });
      const { url } = await res.json();
      
      const blobRes = await fetch(url);
      const encryptedBuffer = await blobRes.arrayBuffer();

      const decryptedBuffer = await decryptData(encryptedBuffer, file.iv, vaultPassword);
      
      const blob = new Blob([decryptedBuffer], { type: file.type });
      const blobUrl = URL.createObjectURL(blob);
      
      setDecryptedBlobUrl(blobUrl);
      setActiveFile(file);
    } catch (err) {
      console.error(err);
      alert("Decryption failed. Wrong vault password?");
    } finally {
      setLoading(false);
    }
  };

  const closeViewer = () => {
    if (decryptedBlobUrl) URL.revokeObjectURL(decryptedBlobUrl);
    setDecryptedBlobUrl(null);
    setActiveFile(null);
  };
  
  const handleDownload = () => {
     if (decryptedBlobUrl && activeFile) {
        const a = document.createElement('a');
        a.href = decryptedBlobUrl;
        a.download = activeFile.name;
        a.click();
     }
  };
  
  const handleResize = () => {
     if (!decryptedBlobUrl || !activeFile) return;
     const img = new Image();
     img.src = decryptedBlobUrl;
     img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const scale = resizePercent / 100;
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        if(ctx) ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => {
           if(b) {
             const u = URL.createObjectURL(b);
             const a = document.createElement('a');
             a.href = u;
             a.download = `resized-${activeFile.name}`;
             a.click();
           }
        }, activeFile.type);
     };
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleAppLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
          <ShieldCheck size={40} className="mx-auto text-blue-600 mb-6" />
          <h1 className="text-2xl font-bold mb-6">Secure Access</h1>
          <input 
            type="password" 
            className="w-full p-3 border rounded-xl mb-4"
            placeholder="System Password"
            value={appPassword}
            onChange={e => setAppPassword(e.target.value)}
          />
          <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold">
            {loading ? 'Verifying...' : 'Enter'}
          </button>
        </form>
      </div>
    );
  }

  if (!isVaultUnlocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <form onSubmit={handleVaultUnlock} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border-t-4 border-yellow-400">
          <Lock size={40} className="mx-auto text-yellow-600 mb-6" />
          <h1 className="text-2xl font-bold mb-2">Decrypt Vault</h1>
          <p className="text-gray-500 mb-6 text-sm">Enter private key to decrypt files in browser.</p>
          <input 
            type="password" 
            className="w-full p-3 border rounded-xl mb-4"
            placeholder="Vault Password"
            value={vaultPassword}
            onChange={e => setVaultPassword(e.target.value)}
          />
          <button type="submit" className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold">Unlock</button>
        </form>
      </div>
    );
  }

  const currentFiles = files.filter(f => f.folderId === currentFolderId);

  return (
    <div className="flex h-screen bg-[#F3F4F6] text-gray-900">
      <aside className="hidden md:flex flex-col w-64 bg-[#F9FAFB] border-r p-4">
        <h2 className="font-bold text-lg mb-8 px-2">Vault.ai</h2>
        {folders.map(f => (
          <button key={f.id} onClick={() => setCurrentFolderId(f.id)} 
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${currentFolderId === f.id ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}>
            <Folder size={18} /> {f.name}
          </button>
        ))}
        <button onClick={createFolder} className="mt-2 flex items-center gap-3 px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">
           <Plus size={18} /> New Folder
        </button>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur border-b">
           <h2 className="text-xl font-bold">{folders.find(f => f.id === currentFolderId)?.name || 'Files'}</h2>
           <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer flex items-center gap-2">
             <UploadCloud size={16} /> Upload
             <input type="file" className="hidden" multiple onChange={handleFileUpload} disabled={loading} />
           </label>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6">
           {currentFiles.length === 0 ? (
             <div className="h-64 flex items-center justify-center text-gray-400">Empty Folder</div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {currentFiles.map(file => (
                 <div key={file.id} onClick={() => handleFileClick(file)} className="bg-white p-4 rounded-xl shadow-sm border hover:border-blue-300 cursor-pointer">
                    <div className="flex justify-between mb-3"><FileText className="text-gray-400" /></div>
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{(file.size/1024).toFixed(1)} KB</div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </main>

      <Modal isOpen={!!activeFile} onClose={closeViewer} title={activeFile?.name}>
         <div className="p-6 flex flex-col items-center">
            {decryptedBlobUrl && activeFile?.type.includes('image') ? (
               <>
                 <img src={decryptedBlobUrl} className="max-h-[50vh] mb-4 object-contain" />
                 <div className="flex gap-2 items-center bg-gray-100 p-2 rounded">
                    <span>Resize %:</span>
                    <input type="number" value={resizePercent} onChange={e => setResizePercent(Number(e.target.value))} className="w-16 p-1 border rounded" />
                    <button onClick={handleResize} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">Download Resized</button>
                 </div>
               </>
            ) : decryptedBlobUrl ? (
               <iframe src={decryptedBlobUrl} className="w-full h-[60vh] border rounded" />
            ) : <p>Loading...</p>}
            
            <button onClick={handleDownload} className="mt-4 text-blue-600 text-sm font-medium">Download Original</button>
         </div>
      </Modal>
    </div>
  );
}