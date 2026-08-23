import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import React, { memo, useState } from 'react';

interface PetImageProps {
    apiImage?: string;
    customImage?: string;
    alt: string;
    placeholder: string;
}

function PetImage({ apiImage, customImage, alt, placeholder }: PetImageProps): React.JSX.Element {
    const [failedSources, setFailedSources] = useState<readonly string[]>([]);
    const source =
        apiImage && !failedSources.includes(apiImage)
            ? apiImage
            : customImage && !failedSources.includes(customImage)
              ? customImage
              : undefined;

    if (!source) {
        return (
            <Box
                sx={{ height: 230, display: 'grid', placeItems: 'center', bgcolor: 'action.hover' }}
                role="img"
                aria-label={placeholder}
            >
                <Box sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    <Typography
                        aria-hidden="true"
                        fontSize="3.5rem"
                    >
                        🐾
                    </Typography>
                    <Typography variant="body2">{placeholder}</Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box
            component="img"
            src={source}
            alt={alt}
            onError={() => setFailedSources(previous => (previous.includes(source) ? previous : [...previous, source]))}
            sx={{ width: '100%', height: 230, display: 'block', objectFit: 'cover', bgcolor: 'action.hover' }}
        />
    );
}

export default memo(PetImage);
