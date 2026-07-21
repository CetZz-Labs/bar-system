import { useState, useRef, useCallback, useEffect } from "react";
import { Camera, X, AlertTriangle } from "lucide-react";

const MAX_SIZE_BYTES = 2 * 1024 * 1024;

interface FileUploadProps {
    onFileSelect: (file: File | null) => void;
    previewUrl: string | null;
    error?: string;
    label?: string;
    disabled?: boolean;
}

export function FileUpload({ onFileSelect, previewUrl, error, label, disabled }: FileUploadProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);
    const [squareWarning, setSquareWarning] = useState(false);

    useEffect(() => {
        if (!previewUrl) {
            setSquareWarning(false);
            return;
        }
        const img = new Image();
        img.onload = () => {
            setSquareWarning(img.width !== img.height);
        };
        img.src = previewUrl;
    }, [previewUrl]);

    const handleFile = useCallback((file: File) => {
        if (file.size > MAX_SIZE_BYTES) {
            onFileSelect(null);
            return;
        }
        if (!file.type.startsWith("image/")) {
            onFileSelect(null);
            return;
        }
        onFileSelect(file);
    }, [onFileSelect]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    };

    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFileSelect(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    const handleClick = () => {
        if (disabled) return;
        inputRef.current?.click();
    };

    return (
        <div className="flex flex-col gap-2 w-full">
            <label className="overline">{label ?? "FOTO DE PERFIL (OPCIONAL)"}</label>
            <button
                type="button"
                onClick={handleClick}
                onDragEnter={disabled ? undefined : handleDrag}
                onDragLeave={disabled ? undefined : handleDrag}
                onDragOver={disabled ? undefined : handleDrag}
                onDrop={disabled ? undefined : handleDrop}
                className={`relative flex flex-col items-center justify-center w-full h-40 rounded-md border-2 border-dashed transition-colors
                    ${dragActive ? "border-lime bg-lime-dim" : "border-border bg-surface-2 hover:border-border-hover"}
                    ${error ? "border-error" : ""}
                    ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleChange}
                    disabled={disabled}
                    className="hidden"
                />

                {previewUrl ? (
                    <>
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-md"
                        />
                        {!disabled && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-full bg-error text-white hover:bg-error/80 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <Camera size={32} className="text-text-secondary mb-2" />
                        <p className="text-text-secondary text-sm text-center px-4">
                            Arrastrá una foto o tocá para seleccionar
                        </p>
                        <p className="text-text-muted text-xs mt-1">
                            JPG, PNG · Máx. 2MB
                        </p>
                    </>
                )}
            </button>
            {squareWarning && (
                <div className="flex items-center gap-2 text-text-secondary text-sm">
                    <AlertTriangle size={16} className="text-lime" />
                    <span>La imagen no es cuadrada. Se recortará automáticamente.</span>
                </div>
            )}
            {error && (
                <span className="font-ui text-sm text-error">{error}</span>
            )}
        </div>
    );
}
