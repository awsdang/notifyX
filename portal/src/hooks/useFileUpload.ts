import { useState, useCallback } from 'react';

export function useFileUpload() {
    const [isDragging, setIsDragging] = useState(false);

    const readFile = useCallback((file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }, []);

    const onDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const onDragLeave = useCallback(() => {
        setIsDragging(false);
    }, []);

    return {
        isDragging,
        setIsDragging,
        readFile,
        onDragOver,
        onDragLeave,
    };
}
