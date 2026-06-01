package crypto

import (
	"crypto/aes"
	"encoding/hex"
	"errors"
	"strings"
)

// AES-ECB keys (same as original Electron app)
const (
	SIPCredentialKey = "vL4oU4jJ8qS3oC4v" // for SIP extension/password decryption
	PhoneNumberKey   = "2has1d8jef49v0ru" // for phone number encrypt/decrypt
)

// --- AES-ECB low-level ---

func ecbEncryptBlock(block, dst, src []byte, cipher interface{ BlockSize() int; Encrypt(dst, src []byte) }) {
	cipher.Encrypt(dst, src)
}

// EncryptECB encrypts data using AES-ECB with PKCS7 padding
func EncryptECB(plaintext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	plaintext = pkcs7Pad(plaintext, aes.BlockSize)
	ciphertext := make([]byte, len(plaintext))

	for i := 0; i < len(plaintext); i += aes.BlockSize {
		block.Encrypt(ciphertext[i:i+aes.BlockSize], plaintext[i:i+aes.BlockSize])
	}

	return ciphertext, nil
}

// DecryptECB decrypts data using AES-ECB with PKCS7 unpadding
func DecryptECB(ciphertext, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	if len(ciphertext)%aes.BlockSize != 0 {
		return nil, errors.New("ciphertext is not a multiple of block size")
	}

	plaintext := make([]byte, len(ciphertext))
	for i := 0; i < len(ciphertext); i += aes.BlockSize {
		block.Decrypt(plaintext[i:i+aes.BlockSize], ciphertext[i:i+aes.BlockSize])
	}

	return pkcs7Unpad(plaintext)
}

func pkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - len(data)%blockSize
	padText := make([]byte, padding)
	for i := range padText {
		padText[i] = byte(padding)
	}
	return append(data, padText...)
}

func pkcs7Unpad(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("empty data")
	}
	padding := int(data[len(data)-1])
	if padding > len(data) || padding == 0 {
		return nil, errors.New("invalid padding")
	}
	for i := len(data) - padding; i < len(data); i++ {
		if data[i] != byte(padding) {
			return nil, errors.New("invalid padding")
		}
	}
	return data[:len(data)-padding], nil
}

// --- High-level functions matching the original tools.ts ---

// DecryptSIPCredential decrypts SIP extension number or password (CB function)
// Input: hex string -> to bytes -> AES-ECB decrypt -> UTF-8 string
func DecryptSIPCredential(hexText string) (string, error) {
	if hexText == "" {
		return "", nil
	}
	cipherBytes, err := hex.DecodeString(hexText)
	if err != nil {
		return "", err
	}
	plain, err := DecryptECB(cipherBytes, []byte(SIPCredentialKey))
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// DecryptPhoneNumber decrypts a phone number from server (CBNumber function)
// Input: hex string -> to bytes -> AES-ECB decrypt -> UTF-8 string
func DecryptPhoneNumber(hexText string) (string, error) {
	if hexText == "" {
		return "", nil
	}
	cipherBytes, err := hex.DecodeString(hexText)
	if err != nil {
		return "", err
	}
	plain, err := DecryptECB(cipherBytes, []byte(PhoneNumberKey))
	if err != nil {
		return "", err
	}
	return string(plain), nil
}

// EncryptPhoneNumber encrypts a phone number for API calls (encryptText function)
// Input: plain text -> AES-ECB encrypt -> hex string (uppercase)
func EncryptPhoneNumber(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	cipherBytes, err := EncryptECB([]byte(plaintext), []byte(PhoneNumberKey))
	if err != nil {
		return "", err
	}
	return strings.ToUpper(hex.EncodeToString(cipherBytes)), nil
}
