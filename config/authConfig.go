package config

import (
	"log"
	"os"
)

// Auth0Config stores necessary Auth0 details for token validation
type Auth0Config struct {
	JWKSURL     string
	JWTIssuer   string
	JWTAudience string
}

func LoadAuth0Config() *Auth0Config {
	jwksURL := os.Getenv("AUTH0_JWKS_URL")
	if jwksURL == "" {
		log.Fatal("Missing Auth0 JWKS URL")
	}

	jwtIssuer := os.Getenv("AUTH0_ISSUER")
	if jwtIssuer == "" {
		log.Fatal("Missing Auth0 Issuer")
	}

	jwtAudience := os.Getenv("AUTH0_AUDIENCE")
	if jwtAudience == "" {
		log.Fatal("Missing Auth0 Audience")
	}

	return &Auth0Config{
		JWKSURL:     jwksURL,
		JWTIssuer:   jwtIssuer,
		JWTAudience: jwtAudience,
	}
}
