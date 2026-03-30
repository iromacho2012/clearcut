import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import * as imgly from '@imgly/background-removal';
import { motion, AnimatePresence } from 'motion/react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

import { 
  Upload, 
  Download, 
  Trash2, 
  Image as ImageIcon, 
  Loader2, 
  CheckCircle2, 
  History, 
  Sparkles,
  RefreshCw,
  ArrowRight,
  Palette,
  X,
  Crop,
  RotateCw,
  Maximize
} from 'lucide-react';
import confetti from 'canvas-confetti';
import Cropper from 'react-easy-crop';
import { cn } from './lib/utils';
import { generateNewBackground } from './services/gemini';
import { getCroppedImg, rotateImage } from './lib/imageUtils';

// Helper to call the removal function regardless of export style
const removeBackground = (imgly as any).default || (imgly as any).removeBackground || imgly;

interface ProcessedImage {
  id: string;
  original: string;
  processed: string;
  timestamp: number;
}

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<ProcessedImage[]>([]);
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');
  const [bgColor, setBgColor] = useState<string>('transparent');
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [hasApiKey, setHasApiKey] = useState(true);

  // Editing states
  const [isCropping, setIsCropping] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeWidth, setResizeWidth] = useState<number>(0);
  const [resizeHeight, setResizeHeight] = useState<number>(0);

  // Check for API key on mount
  useEffect(() => {
    const checkKey = async () => {
      if (window.aistudio?.hasSelectedApiKey) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      }
    };
    checkKey();
  }, []);

  const handleSelectKey = async () => {
    if (window.aistudio?.openSelectKey) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true); // Assume success to proceed
    }
  };

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('clearcut_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  // Save history to localStorage
  const saveToHistory = useCallback((original: string, processed: string) => {
    const newItem: ProcessedImage = {
      id: Math.random().toString(36).substr(2, 9),
      original,
      processed,
      timestamp: Date.now(),
    };
    setHistory(prev => {
      const updated = [newItem, ...prev].slice(0, 10);
      localStorage.setItem('clearcut_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        setError('Please upload a valid image file.');
        return;
      }
      setFile(selectedFile);
      setOriginalUrl(URL.createObjectURL(selectedFile));
      setProcessedUrl(null);
      setError(null);
      setBgColor('transparent');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: false,
  } as any);

  const handleProcess = async () => {
    if (!file) return;
    setIsProcessing(true);
    setError(null);

    try {
      const blob = await removeBackground(file, {
        progress: (key, current, total) => {
          console.log(`Processing ${key}: ${current}/${total}`);
        },
      });
      const url = URL.createObjectURL(blob);
      setProcessedUrl(url);
      
      // Convert to base64 for history (blobs are temporary)
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Processed = reader.result as string;
        const readerOrig = new FileReader();
        readerOrig.onloadend = () => {
          saveToHistory(readerOrig.result as string, base64Processed);
        };
        readerOrig.readAsDataURL(file);
      };
      reader.readAsDataURL(blob);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#10b981', '#6366f1']
      });
    } catch (err) {
      console.error(err);
      setError('Failed to process image. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAiReplace = async () => {
    if (!originalUrl || !aiPrompt) return;
    setIsGeneratingBg(true);
    setError(null);
    try {
      const response = await fetch(originalUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      const result = await generateNewBackground(base64, aiPrompt);
      setProcessedUrl(result);
      setBgColor('custom');
    } catch (err: any) {
      console.error(err);
      if (err.message === "API_KEY_MISSING" || err.message.includes("API key not valid")) {
        setHasApiKey(false);
        setError('Please select a valid Gemini API key to use AI features.');
      } else {
        setError('AI Background generation failed.');
      }
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const downloadImage = () => {
    if (!processedUrl) return;
    
    if (bgColor !== 'transparent' && bgColor !== 'custom') {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          const link = document.createElement('a');
          link.download = 'clearcut-result.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        }
      };
      img.src = processedUrl;
    } else {
      const link = document.createElement('a');
      link.download = 'clearcut-result.png';
      link.href = processedUrl;
      link.click();
    }
  };

  const clearAll = () => {
    setFile(null);
    setOriginalUrl(null);
    setProcessedUrl(null);
    setError(null);
    setAiPrompt('');
  };

  const onCropComplete = useCallback((_croppedArea: any, pixelCrop: any) => {
    setCroppedAreaPixels(pixelCrop);
  }, []);

  const handleCropSave = async () => {
    if (!processedUrl || !croppedAreaPixels) return;
    try {
      const croppedImage = await getCroppedImg(processedUrl, croppedAreaPixels);
      setProcessedUrl(croppedImage);
      setIsCropping(false);
    } catch (e) {
      console.error(e);
      setError('Failed to crop image');
    }
  };

  const handleRotate = async () => {
    if (!processedUrl) return;
    try {
      const rotated = await rotateImage(processedUrl, 90);
      setProcessedUrl(rotated);
    } catch (e) {
      console.error(e);
      setError('Failed to rotate image');
    }
  };

  const handleResize = async () => {
    if (!processedUrl || !resizeWidth || !resizeHeight) return;
    try {
      const img = new Image();
      img.src = processedUrl;
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement('canvas');
      canvas.width = resizeWidth;
      canvas.height = resizeHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, resizeWidth, resizeHeight);
        setProcessedUrl(canvas.toDataURL('image/png'));
        setIsResizing(false);
      }
    } catch (e) {
      console.error(e);
      setError('Failed to resize image');
    }
  };

  useEffect(() => {
    if (processedUrl && !resizeWidth) {
      const img = new Image();
      img.src = processedUrl;
      img.onload = () => {
        setResizeWidth(img.width);
        setResizeHeight(img.height);
      };
    }
  }, [processedUrl]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-blue-100">
      {/* API Key Banner */}
      <AnimatePresence>
        {!hasApiKey && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-50 border-b border-amber-100 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                <span>To use AI features, please select a Gemini API key.</span>
                <a 
                  href="https://ai.google.dev/gemini-api/docs/billing" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="underline hover:text-amber-900"
                >
                  Learn about billing
                </a>
              </div>
              <button 
                onClick={handleSelectKey}
                className="bg-amber-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors"
              >
                Select API Key
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={clearAll}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">ClearCut AI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab('editor')}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all",
                activeTab === 'editor' ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900"
              )}
            >
              Editor
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                activeTab === 'history' ? "bg-blue-50 text-blue-600" : "text-gray-500 hover:text-gray-900"
              )}
            >
              <History className="w-4 h-4" />
              History
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {activeTab === 'editor' ? (
            <motion.div 
              key="editor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Hero Section */}
              {!file && (
                <div className="text-center space-y-4 max-w-2xl mx-auto">
                  <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl">
                    Remove backgrounds <span className="text-blue-600">instantly.</span>
                  </h1>
                  <p className="text-lg text-gray-500 leading-relaxed">
                    Professional AI-powered tool to remove backgrounds and replace them with anything you imagine. 100% automatic and free.
                  </p>
                </div>
              )}

              {/* Main Interaction Area */}
              <div className="max-w-4xl mx-auto">
                {!file ? (
                  <div 
                    {...getRootProps()} 
                    className={cn(
                      "relative group cursor-pointer rounded-3xl border-2 border-dashed transition-all duration-300 ease-in-out p-12 flex flex-col items-center justify-center gap-6",
                      isDragActive ? "border-blue-500 bg-blue-50/50" : "border-gray-200 bg-white hover:border-blue-400 hover:bg-gray-50/50"
                    )}
                  >
                    <input {...getInputProps()} />
                    <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Upload className="w-10 h-10 text-blue-600" />
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-xl font-semibold text-gray-900">Drop your image here</p>
                      <p className="text-gray-500">or click to browse from your device</p>
                    </div>
                    <div className="flex gap-4 mt-4">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Supports PNG, JPG, WEBP</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Toolbar */}
                    <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={clearAll}
                          className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors"
                          title="Clear current image"
                        >
                          <X className="w-5 h-5" />
                        </button>
                        <div className="h-6 w-px bg-gray-200" />
                        <span className="text-sm font-medium text-gray-600 truncate max-w-[200px]">
                          {file.name}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {!processedUrl ? (
                          <button
                            onClick={handleProcess}
                            disabled={isProcessing}
                            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-lg shadow-blue-200"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-5 h-5" />
                                Remove Background
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={downloadImage}
                            className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-green-700 transition-all shadow-lg shadow-green-200"
                          >
                            <Download className="w-5 h-5" />
                            Download Result
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Editing Toolbar */}
                    {processedUrl && (
                      <div className="flex items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 ml-2">Edit Tools</span>
                        <div className="h-6 w-px bg-gray-200" />
                        <button
                          onClick={() => setIsCropping(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700"
                        >
                          <Crop className="w-4 h-4" />
                          Crop
                        </button>
                        <button
                          onClick={handleRotate}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700"
                        >
                          <RotateCw className="w-4 h-4" />
                          Rotate
                        </button>
                        <button
                          onClick={() => setIsResizing(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors text-gray-700"
                        >
                          <Maximize className="w-4 h-4" />
                          Resize
                        </button>
                      </div>
                    )}

                    {/* Comparison View */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Original */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Original</span>
                        </div>
                        <div className="aspect-square rounded-3xl overflow-hidden bg-gray-100 border border-gray-200 relative group">
                          <img 
                            src={originalUrl!} 
                            alt="Original" 
                            className="w-full h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      </div>

                      {/* Processed */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Result</span>
                          {processedUrl && (
                            <div className="flex gap-2">
                              {['transparent', '#ffffff', '#000000', '#3b82f6', '#ef4444', '#10b981'].map((color) => (
                                <button
                                  key={color}
                                  onClick={() => setBgColor(color)}
                                  className={cn(
                                    "w-5 h-5 rounded-full border border-gray-200 transition-transform hover:scale-125",
                                    bgColor === color && "ring-2 ring-blue-500 ring-offset-2"
                                  )}
                                  style={{ 
                                    backgroundColor: color === 'transparent' ? 'white' : color,
                                    backgroundImage: color === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                                    backgroundSize: '4px 4px'
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div 
                          className="aspect-square rounded-3xl overflow-hidden border border-gray-200 relative flex items-center justify-center transition-all duration-500"
                          style={{ 
                            backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor,
                            backgroundImage: bgColor === 'transparent' ? 'linear-gradient(45deg, #eee 25%, transparent 25%), linear-gradient(-45deg, #eee 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eee 75%), linear-gradient(-45deg, transparent 75%, #eee 75%)' : 'none',
                            backgroundSize: '20px 20px'
                          }}
                        >
                          {isProcessing ? (
                            <div className="flex flex-col items-center gap-4">
                              <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                              <p className="text-sm font-medium text-gray-500">AI is working its magic...</p>
                            </div>
                          ) : processedUrl ? (
                            <motion.img 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              src={processedUrl} 
                              alt="Processed" 
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="text-center p-8">
                              <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                              <p className="text-sm text-gray-400">Click "Remove Background" to see the result</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* AI Background Replacement */}
                    {processedUrl && (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-200"
                      >
                        <div className="flex flex-col md:flex-row items-center gap-8">
                          <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-6 h-6 text-blue-200" />
                              <h3 className="text-2xl font-bold">AI Background Replacement</h3>
                            </div>
                            <p className="text-blue-100">
                              Describe any background you want, and our AI will generate it for you instantly.
                            </p>
                            <div className="relative">
                              <input 
                                type="text"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="e.g. A futuristic cyberpunk city at night with neon lights"
                                className="w-full bg-white/10 border border-white/20 rounded-2xl px-6 py-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/50 transition-all"
                              />
                              <button 
                                onClick={handleAiReplace}
                                disabled={isGeneratingBg || !aiPrompt}
                                className="absolute right-2 top-2 bottom-2 bg-white text-blue-600 px-6 rounded-xl font-bold hover:bg-blue-50 disabled:opacity-50 transition-all flex items-center gap-2"
                              >
                                {isGeneratingBg ? (
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                  <>
                                    Generate
                                    <ArrowRight className="w-5 h-5" />
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                          <div className="w-full md:w-48 aspect-square rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
                            {isGeneratingBg ? (
                              <div className="flex flex-col items-center gap-2">
                                <RefreshCw className="w-8 h-8 animate-spin text-blue-200" />
                                <span className="text-[10px] uppercase tracking-widest font-bold">Generating</span>
                              </div>
                            ) : (
                              <Palette className="w-12 h-12 text-blue-200" />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="max-w-4xl mx-auto bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex items-center gap-3">
                  <X className="w-5 h-5" />
                  <span className="text-sm font-medium">{error}</span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">Recent Activity</h2>
                <button 
                  onClick={() => {
                    setHistory([]);
                    localStorage.removeItem('clearcut_history');
                  }}
                  className="text-sm font-medium text-red-500 hover:text-red-600 flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear History
                </button>
              </div>

              {history.length === 0 ? (
                <div className="bg-white rounded-3xl p-20 border border-gray-100 text-center space-y-4">
                  <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto">
                    <History className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">No processed images yet.</p>
                  <button 
                    onClick={() => setActiveTab('editor')}
                    className="text-blue-600 font-semibold hover:underline"
                  >
                    Start creating now
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {history.map((item) => (
                    <motion.div 
                      key={item.id}
                      layout
                      className="group bg-white rounded-3xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300"
                    >
                      <div className="aspect-square relative overflow-hidden bg-gray-50">
                        <img 
                          src={item.processed} 
                          alt="Processed" 
                          className="w-full h-full object-contain p-4"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                          <button 
                            onClick={() => {
                              setOriginalUrl(item.original);
                              setProcessedUrl(item.processed);
                              setActiveTab('editor');
                            }}
                            className="bg-white text-gray-900 p-3 rounded-full hover:scale-110 transition-transform"
                            title="Open in Editor"
                          >
                            <ImageIcon className="w-5 h-5" />
                          </button>
                          <a 
                            href={item.processed} 
                            download={`clearcut-${item.id}.png`}
                            className="bg-blue-600 text-white p-3 rounded-full hover:scale-110 transition-transform"
                            title="Download"
                          >
                            <Download className="w-5 h-5" />
                          </a>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-400">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-12 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 opacity-50">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold">ClearCut AI</span>
          </div>
          <p className="text-sm text-gray-400">
            Powered by AI. Processed locally in your browser for maximum privacy.
          </p>
          <div className="flex gap-8">
            <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Privacy</a>
            <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Terms</a>
            <a href="#" className="text-sm font-medium text-gray-500 hover:text-gray-900">Contact</a>
          </div>
        </div>
      </footer>

      {/* Crop Modal */}
      <AnimatePresence>
        {isCropping && processedUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 flex flex-col"
          >
            <div className="p-6 flex items-center justify-between text-white">
              <h3 className="text-xl font-bold">Crop Image</h3>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsCropping(false)}
                  className="px-6 py-2 rounded-xl font-semibold hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCropSave}
                  className="bg-blue-600 px-6 py-2 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
                >
                  Apply Crop
                </button>
              </div>
            </div>
            <div className="flex-1 relative">
              <Cropper
                image={processedUrl}
                crop={crop}
                zoom={zoom}
                aspect={undefined}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="p-8 flex flex-col items-center gap-4">
              <input
                type="range"
                value={zoom}
                min={1}
                max={3}
                step={0.1}
                aria-labelledby="Zoom"
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-64 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-white/60 text-sm font-medium uppercase tracking-widest">Zoom</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resize Modal */}
      <AnimatePresence>
        {isResizing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold">Resize Image</h3>
                <button onClick={() => setIsResizing(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">Width (px)</label>
                  <input
                    type="number"
                    value={resizeWidth}
                    onChange={(e) => setResizeWidth(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-400 uppercase tracking-widest">Height (px)</label>
                  <input
                    type="number"
                    value={resizeHeight}
                    onChange={(e) => setResizeHeight(Number(e.target.value))}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => setIsResizing(false)}
                  className="flex-1 px-6 py-3 rounded-xl font-semibold border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleResize}
                  className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                >
                  Apply Resize
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
