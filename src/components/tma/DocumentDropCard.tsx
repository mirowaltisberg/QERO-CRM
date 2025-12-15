"use client";

import { useCallback, useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface DocumentDropCardProps {
  title: string;
  url: string | null;
  accept?: string;
  uploading: boolean;
  onUpload: (file: File) => void;
  /** i18n labels */
  labels?: {
    formats?: string;
    viewDocument?: string;
    noFile?: string;
    dropToUpload?: string;
    dropToReplace?: string;
    uploading?: string;
    upload?: string;
    replaceTitle?: string;
    replaceDescription?: string;
    cancel?: string;
    replace?: string;
    invalidType?: string;
    fileTooLarge?: string;
  };
}

const defaultLabels = {
  formats: "PDF, DOCX up to 5 MB",
  viewDocument: "View document →",
  noFile: "No file uploaded",
  dropToUpload: "Drop file to upload",
  dropToReplace: "Drop to replace",
  uploading: "Uploading…",
  upload: "Upload",
  replaceTitle: "Replace document?",
  replaceDescription: "A file already exists. Do you want to replace it?",
  cancel: "Cancel",
  replace: "Replace",
  invalidType: "Invalid file type. Please use PDF or DOCX.",
  fileTooLarge: "File too large. Maximum size is 5 MB.",
};

export function DocumentDropCard({
  title,
  url,
  accept = ".pdf,.doc,.docx",
  uploading,
  onUpload,
  labels: customLabels,
}: DocumentDropCardProps) {
  const labels = { ...defaultLabels, ...customLabels };
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragActive, setIsDragActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragCounter = useRef(0);

  const validateFile = useCallback((file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return labels.invalidType;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return labels.fileTooLarge;
    }
    return null;
  }, [labels.invalidType, labels.fileTooLarge]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (url) {
      // Existing file - show confirmation
      setPendingFile(file);
      setConfirmOpen(true);
    } else {
      // No existing file - upload immediately
      onUpload(file);
    }
  }, [url, onUpload, validateFile]);

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragActive(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounter.current = 0;

    if (uploading) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [uploading, handleFile]);

  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset input so same file can be selected again
    e.target.value = "";
  }, [handleFile]);

  const handleConfirmReplace = useCallback(() => {
    if (pendingFile) {
      onUpload(pendingFile);
      setPendingFile(null);
    }
    setConfirmOpen(false);
  }, [pendingFile, onUpload]);

  const handleCancelReplace = useCallback(() => {
    setPendingFile(null);
    setConfirmOpen(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!uploading) {
      fileInputRef.current?.click();
    }
  }, [uploading]);

  return (
    <>
      <motion.div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        animate={{
          scale: isDragActive ? 1.02 : 1,
          boxShadow: isDragActive 
            ? "0 8px 30px rgba(59, 130, 246, 0.15)" 
            : "0 1px 3px rgba(0, 0, 0, 0.05)",
        }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
        className={cn(
          "relative rounded-2xl border-2 border-dashed p-4 transition-colors",
          uploading 
            ? "border-gray-200 bg-gray-50 cursor-wait" 
            : isDragActive 
              ? "border-blue-400 bg-blue-50" 
              : "border-gray-200 bg-white hover:border-gray-300 cursor-pointer"
        )}
        onClick={handleClick}
      >
        {/* Content */}
        <div className="relative z-10">
          <p className="text-sm font-medium text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{labels.formats}</p>
          
          {url ? (
            <a 
              href={url} 
              target="_blank" 
              rel="noreferrer" 
              className="mt-2 inline-flex text-sm text-blue-600 hover:text-blue-700"
              onClick={(e) => e.stopPropagation()}
            >
              {labels.viewDocument}
            </a>
          ) : (
            <p className="mt-2 text-xs text-gray-400">{labels.noFile}</p>
          )}

          {/* Upload button / status */}
          <div className="mt-3">
            {uploading ? (
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {labels.uploading}
              </div>
            ) : (
              <span className="inline-flex items-center justify-center rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-500 hover:text-gray-900 transition-colors">
                {labels.upload}
              </span>
            )}
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-2 text-xs text-red-500">{error}</p>
          )}
        </div>

        {/* Drag overlay */}
        <AnimatePresence>
          {isDragActive && !uploading && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-blue-500/90 backdrop-blur-sm"
            >
              <div className="text-center">
                <svg className="mx-auto h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="mt-2 text-sm font-medium text-white">
                  {url ? labels.dropToReplace : labels.dropToUpload}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInputChange}
        />
      </motion.div>

      {/* Confirmation Modal */}
      <Modal open={confirmOpen} onClose={handleCancelReplace}>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{labels.replaceTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {labels.replaceDescription}
            </p>
            {pendingFile && (
              <p className="mt-2 text-xs text-gray-600">
                New file: <span className="font-medium">{pendingFile.name}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={handleCancelReplace}>
              {labels.cancel}
            </Button>
            <Button onClick={handleConfirmReplace}>
              {labels.replace}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
