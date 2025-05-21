import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { parsePsdFile, PsdLayerMetadata } from '@/utils/psd-parser';

interface FileUploadProps {
  onFileUpload?: (file: File) => void;
  onPsdParsed?: (layers: PsdLayerMetadata[]) => void;
}

interface StoredFileInfo {
  name: string;
  type: string;
}

export function FileUpload({ onFileUpload, onPsdParsed }: FileUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Load file info from localStorage on component mount
  useEffect(() => {
    const storedFileInfo = localStorage.getItem('psdFileInfo');
    if (storedFileInfo) {
      try {
        const parsedInfo: StoredFileInfo = JSON.parse(storedFileInfo);
        // We can't restore the actual File object, so we just trigger the parent callback
        // with the stored file info if there's a handler
        if (onFileUpload && parsedInfo.name) {
          console.log('Restored file info from localStorage:', parsedInfo);
        }
      } catch (error) {
        console.error('Error parsing stored file info:', error);
        localStorage.removeItem('psdFileInfo');
      }
    }
  }, [onFileUpload]);

  const parsePsd = async (uploadedFile: File) => {
    setParsing(true);
    setParseError(null);
    
    try {
      const layers = await parsePsdFile(uploadedFile);
      console.log('PSD layers extracted:', layers);
      
      if (onPsdParsed) {
        onPsdParsed(layers);
      }
    } catch (error) {
      console.error('Error parsing PSD:', error);
      setParseError(error instanceof Error ? error.message : 'Unknown error parsing PSD file');
    } finally {
      setParsing(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const uploadedFile = acceptedFiles[0];
    if (uploadedFile) {
      setFile(uploadedFile);
      
      // Store file info in localStorage
      const fileInfo: StoredFileInfo = {
        name: uploadedFile.name,
        type: uploadedFile.type
      };
      localStorage.setItem('psdFileInfo', JSON.stringify(fileInfo));
      
      if (onFileUpload) {
        onFileUpload(uploadedFile);
      }
      
      // Dispatch a custom event to notify that a new file is uploaded
      const newFileEvent = new CustomEvent("psd_new_file_uploaded");
      window.dispatchEvent(newFileEvent);
      
      // Parse the PSD file
      await parsePsd(uploadedFile);
    }
  }, [onFileUpload, onPsdParsed]);

  const clearFile = () => {
    setFile(null);
    setParseError(null);
    
    // Clear localStorage items
    localStorage.removeItem('psdFileInfo');
    localStorage.removeItem('psd_structure');
    
    // Clear sessionStorage items
    sessionStorage.removeItem('psd_tree_expanded');
    sessionStorage.removeItem('psd_layer_visibility');
    sessionStorage.removeItem('psd_layer_labels');
    
    // Dispatch event to notify other components
    const clearEvent = new CustomEvent('psd_file_cleared');
    window.dispatchEvent(clearEvent);

    // Reload the app
    window.location.reload();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/vnd.adobe.photoshop': ['.psd'],
    },
    maxFiles: 1,
  });

  return (
    <div className="w-full max-w-md mx-auto">
      <div
        {...getRootProps()}
        className={`p-6 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : parsing 
              ? 'border-amber-400 bg-amber-50' 
              : parseError 
                ? 'border-red-400 bg-red-50'
                : 'border-gray-300 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center justify-center space-y-2 text-center">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mb-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <h3 className="text-lg font-medium">Drag & drop Master PSD file here</h3>
          <p className="text-sm text-gray-500">or click to browse files</p>
          
          {parsing && (
            <p className="text-sm text-amber-600 mt-2">Parsing PSD file, please wait...</p>
          )}
          
          {parseError && (
            <p className="text-sm text-red-600 mt-2">Error: {parseError}</p>
          )}
        </div>
      </div>

      {file && (
        <div className="mt-4 p-4 border rounded-lg bg-gray-50">
          <h4 className="text-sm font-medium">Uploaded File</h4>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm truncate max-w-[calc(100%-4rem)]">{file.name}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
            >
              Remove
            </Button>
          </div>
          
          {!parsing && !parseError && localStorage.getItem('psd_structure') && (
            <div className="mt-2 pt-2 border-t">
              <p className="text-sm text-green-600">✓ PSD structure extracted and stored</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 