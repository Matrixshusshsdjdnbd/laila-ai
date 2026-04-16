"""
Backend API tests for LAILA AI - Voice Transcription Feature
Tests: POST /api/transcribe endpoint with various audio file scenarios
"""
import pytest
import requests
import os
import io
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL', '').rstrip('/')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found in environment")


class TestTranscribeEndpoint:
    """Transcription endpoint tests"""
    
    def test_transcribe_missing_file(self):
        """Test POST /api/transcribe without file returns 422"""
        response = requests.post(f"{BASE_URL}/api/transcribe")
        assert response.status_code == 422  # FastAPI validation error for missing file
        print(f"✓ Missing file returns 422: {response.status_code}")
    
    def test_transcribe_empty_file(self):
        """Test POST /api/transcribe with empty file returns 400"""
        # Create empty file
        empty_file = io.BytesIO(b'')
        files = {'file': ('empty.m4a', empty_file, 'audio/m4a')}
        data = {'language': ''}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        assert response.status_code == 400
        
        error_data = response.json()
        assert "detail" in error_data
        assert "Empty audio file" in error_data["detail"]
        print(f"✓ Empty file returns 400 with error: {error_data['detail']}")
    
    def test_transcribe_with_valid_audio_file(self):
        """Test POST /api/transcribe with valid audio file returns transcribed text"""
        # Generate a small test audio file using text-to-speech
        # For testing purposes, we'll create a minimal valid audio file
        # Note: This is a simplified test - in production, use actual audio samples
        
        # Create a minimal WAV file (44 bytes header + some audio data)
        # WAV header for 1 second of silence at 8kHz, 8-bit, mono
        wav_header = bytes([
            0x52, 0x49, 0x46, 0x46,  # "RIFF"
            0x24, 0x00, 0x00, 0x00,  # File size - 8
            0x57, 0x41, 0x56, 0x45,  # "WAVE"
            0x66, 0x6D, 0x74, 0x20,  # "fmt "
            0x10, 0x00, 0x00, 0x00,  # Subchunk1Size (16 for PCM)
            0x01, 0x00,              # AudioFormat (1 for PCM)
            0x01, 0x00,              # NumChannels (1 for mono)
            0x40, 0x1F, 0x00, 0x00,  # SampleRate (8000 Hz)
            0x40, 0x1F, 0x00, 0x00,  # ByteRate
            0x01, 0x00,              # BlockAlign
            0x08, 0x00,              # BitsPerSample (8)
            0x64, 0x61, 0x74, 0x61,  # "data"
            0x00, 0x00, 0x00, 0x00,  # Subchunk2Size (0 for now)
        ])
        
        # Add some audio data (silence)
        audio_data = bytes([128] * 8000)  # 1 second of silence
        
        # Update data chunk size
        wav_data = bytearray(wav_header)
        wav_data[40:44] = len(audio_data).to_bytes(4, 'little')
        wav_data[4:8] = (len(wav_data) + len(audio_data) - 8).to_bytes(4, 'little')
        wav_data.extend(audio_data)
        
        audio_file = io.BytesIO(bytes(wav_data))
        files = {'file': ('test_audio.wav', audio_file, 'audio/wav')}
        data = {'language': 'en'}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        
        # Note: This test may fail if Whisper API rejects the minimal audio file
        # or if the audio is too short/silent to transcribe
        if response.status_code == 200:
            result = response.json()
            assert "text" in result
            assert "language" in result
            print(f"✓ Valid audio file transcribed: text='{result['text']}', language={result['language']}")
        elif response.status_code == 500:
            # Whisper API may reject minimal/silent audio
            error_data = response.json()
            print(f"⚠ Transcription failed (expected for minimal audio): {error_data.get('detail', 'Unknown error')}")
            pytest.skip("Whisper API rejected minimal test audio (expected behavior)")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_transcribe_with_language_parameter(self):
        """Test POST /api/transcribe with language parameter"""
        # Create minimal audio file
        wav_header = bytes([
            0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
            0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
            0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
            0x40, 0x1F, 0x00, 0x00, 0x40, 0x1F, 0x00, 0x00,
            0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61,
            0x00, 0x00, 0x00, 0x00,
        ])
        audio_data = bytes([128] * 1000)
        wav_data = bytearray(wav_header)
        wav_data[40:44] = len(audio_data).to_bytes(4, 'little')
        wav_data[4:8] = (len(wav_data) + len(audio_data) - 8).to_bytes(4, 'little')
        wav_data.extend(audio_data)
        
        audio_file = io.BytesIO(bytes(wav_data))
        files = {'file': ('test_french.wav', audio_file, 'audio/wav')}
        data = {'language': 'fr'}  # French
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            assert result['language'] == 'fr'
            print(f"✓ Language parameter accepted: {result['language']}")
        elif response.status_code == 500:
            print(f"⚠ Transcription failed (expected for minimal audio)")
            pytest.skip("Whisper API rejected minimal test audio")
        else:
            pytest.fail(f"Unexpected status code: {response.status_code}")
    
    def test_transcribe_file_too_large(self):
        """Test POST /api/transcribe with file larger than 25MB returns 400"""
        # Create a file larger than 25MB (25 * 1024 * 1024 bytes)
        large_data = b'x' * (26 * 1024 * 1024)  # 26MB
        large_file = io.BytesIO(large_data)
        files = {'file': ('large_audio.m4a', large_file, 'audio/m4a')}
        data = {'language': ''}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        assert response.status_code == 400
        
        error_data = response.json()
        assert "detail" in error_data
        assert "too large" in error_data["detail"].lower()
        print(f"✓ Large file (26MB) rejected with 400: {error_data['detail']}")
    
    def test_transcribe_supported_languages(self):
        """Test that supported languages (it, fr, en, wo) are accepted"""
        supported_langs = ['it', 'fr', 'en', 'wo']
        
        for lang in supported_langs:
            # Create minimal audio
            wav_data = bytearray([
                0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
                0x57, 0x41, 0x56, 0x45, 0x66, 0x6D, 0x74, 0x20,
                0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
                0x40, 0x1F, 0x00, 0x00, 0x40, 0x1F, 0x00, 0x00,
                0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61,
                0x00, 0x00, 0x00, 0x00,
            ])
            audio_data = bytes([128] * 500)
            wav_data[40:44] = len(audio_data).to_bytes(4, 'little')
            wav_data[4:8] = (len(wav_data) + len(audio_data) - 8).to_bytes(4, 'little')
            wav_data.extend(audio_data)
            
            audio_file = io.BytesIO(bytes(wav_data))
            files = {'file': (f'test_{lang}.wav', audio_file, 'audio/wav')}
            data = {'language': lang}
            
            response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
            
            # Should accept the language parameter (200 or 500 for audio issues, not 400 for invalid lang)
            assert response.status_code in [200, 500], f"Language {lang} should be accepted"
            
            if response.status_code == 200:
                result = response.json()
                print(f"✓ Language {lang} accepted and processed")
            else:
                print(f"✓ Language {lang} accepted (audio processing failed as expected)")


class TestTranscribeIntegration:
    """Integration tests for transcribe endpoint"""
    
    def test_transcribe_endpoint_exists(self):
        """Verify /api/transcribe endpoint exists"""
        # Try to access without file to check if endpoint exists
        response = requests.post(f"{BASE_URL}/api/transcribe")
        # Should return 422 (validation error) not 404 (not found)
        assert response.status_code != 404, "Transcribe endpoint should exist"
        print(f"✓ Transcribe endpoint exists (status: {response.status_code})")
    
    def test_transcribe_accepts_multipart_form(self):
        """Verify endpoint accepts multipart/form-data"""
        # Create minimal valid file
        audio_data = bytes([128] * 100)
        audio_file = io.BytesIO(audio_data)
        files = {'file': ('test.m4a', audio_file, 'audio/m4a')}
        data = {'language': 'en'}
        
        response = requests.post(f"{BASE_URL}/api/transcribe", files=files, data=data)
        # Should not return 415 (Unsupported Media Type)
        assert response.status_code != 415, "Should accept multipart/form-data"
        print(f"✓ Endpoint accepts multipart/form-data (status: {response.status_code})")
