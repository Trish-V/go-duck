package server

import (
	"context"
	"github.com/go-kratos/kratos/v2/middleware/auth/jwt"
	"github.com/go-kratos/kratos/v2/middleware/recovery"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/golang-jwt/jwt/v4"
    v1 "go-duck/api/v1"
    "go-duck/internal/service"
    "go-duck/internal/repository"
    "go-duck/config"
)

func NewGRPCServer(conf *config.Config, repo *repository.Repository) *grpc.Server {
	var opts = []grpc.ServerOption{
		grpc.Middleware(
			recovery.Recovery(),
			jwt.Server(func(token *jwt.Token) (interface{}, error) {
				return []byte(conf.GoDuck.Security.KeycloakSecret), nil
			}),
		),
	}
	if conf.GoDuck.Server.GRPC.Addr != "" {
		opts = append(opts, grpc.Address(conf.GoDuck.Server.GRPC.Addr))
	}
	srv := grpc.NewServer(opts...)
    
    // Register Services
    v1.RegisterArticleServiceServer(srv, service.NewArticleService(repo))
    v1.RegisterAuthorServiceServer(srv, service.NewAuthorService(repo))
    // go-duck-needle-add-grpc-service

	return srv
}
