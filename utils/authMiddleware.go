// File: utils/authMiddleware.go
package utils

import (
	"context"
	"errors"
	"github.com/dgrijalva/jwt-go"
	"log"
	"net/http"
	"os"
	"strings"
)

// ValidateJWT validates a JWT token and returns the claims if the token is valid.
func ValidateJWT(tokenString string) (jwt.MapClaims, error) {
	secretKey := []byte(os.Getenv("JWT_SECRET_KEY"))
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			log.Println("JWT validation failed: Unexpected signing method")
			return nil, errors.New("unexpected signing method")
		}
		return secretKey, nil
	})

	if err != nil {
		log.Println("JWT validation failed:", err)
		return nil, err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		log.Println("JWT validated successfully for user:", claims)
		return claims, nil
	}

	log.Println("JWT validation failed: Invalid token")
	return nil, errors.New("invalid token")
}

// JWTMiddleware verifies the JWT and attaches its claims into the request context.
func JWTMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			log.Println("JWT authentication failed: Authorization header missing")
			http.Error(w, "Authorization header missing", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			log.Println("JWT authentication failed: Invalid token format")
			http.Error(w, "Invalid token format", http.StatusUnauthorized)
			return
		}

		claims, err := ValidateJWT(tokenString)
		if err != nil {
			log.Println("JWT authentication failed:", err)
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		log.Println("JWT authentication successful for user:", claims)
		ctx := context.WithValue(r.Context(), "user", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// TPM2Verification simulates verifying a TPM 2.0 signature.
func TPM2Verification(tpm2Token string) (map[string]interface{}, error) {
	tpm2Secret := os.Getenv("TPM2_SECRET") // Securely managed secret

	if tpm2Token == tpm2Secret {
		log.Println("TPM2 verification successful for device STM32")
		return map[string]interface{}{"device": "STM32"}, nil
	}

	log.Println("TPM2 verification failed: Invalid token")
	return nil, errors.New("invalid TPM2 token")
}

// TPM2Middleware authenticates a request from the STM32 using TPM 2.0.
func TPM2Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tpm2Token := r.Header.Get("TPM2-Auth")
		if tpm2Token == "" {
			log.Println("TPM2 authentication failed: TPM2 authentication header missing")
			http.Error(w, "TPM2 authentication header missing", http.StatusUnauthorized)
			return
		}

		claims, err := TPM2Verification(tpm2Token)
		if err != nil {
			log.Println("TPM2 authentication failed:", err)
			http.Error(w, "Invalid TPM2 token", http.StatusUnauthorized)
			return
		}

		log.Println("TPM2 authentication successful for device:", claims)
		ctx := context.WithValue(r.Context(), "device", claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// CombinedAuthMiddleware selects the authentication method based on a header.
func CombinedAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientType := r.Header.Get("X-Client-Type")

		if strings.ToLower(clientType) == "stm32" {
			log.Println("Using TPM2 authentication for STM32 device")
			TPM2Middleware(next).ServeHTTP(w, r)
			return
		}

		log.Println("Using JWT authentication for standard client")
		JWTMiddleware(next).ServeHTTP(w, r)
	})
}
