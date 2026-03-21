package service

import (
	"context"
	pb "go-duck/api/v1"
	"go-duck/internal/repository"
	"go-duck/models"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type AuthorService struct {
	pb.UnimplementedAuthorServiceServer
	repo *repository.Repository
}

func NewAuthorService(repo *repository.Repository) *AuthorService {
	return &AuthorService{repo: repo}
}

func (s *AuthorService) CreateAuthor(ctx context.Context, req *pb.CreateAuthorRequest) (*pb.AuthorReply, error) {
	entity := &models.Author{
		Name: req.Name,
	}
	if err := s.repo.DB.WithContext(ctx).Create(entity).Error; err != nil {
		return nil, err
	}
	return &pb.AuthorReply{
		Data: mapAuthorToPb(entity),
	}, nil
}

func (s *AuthorService) GetAuthor(ctx context.Context, req *pb.GetAuthorRequest) (*pb.AuthorReply, error) {
	var entity models.Author
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.AuthorReply{
		Data: mapAuthorToPb(&entity),
	}, nil
}

func (s *AuthorService) UpdateAuthor(ctx context.Context, req *pb.UpdateAuthorRequest) (*pb.AuthorReply, error) {
	var entity models.Author
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	
	entity.Name = req.Name

	if err := s.repo.DB.WithContext(ctx).Save(&entity).Error; err != nil {
		return nil, err
	}
	return &pb.AuthorReply{
		Data: mapAuthorToPb(&entity),
	}, nil
}

func (s *AuthorService) DeleteAuthor(ctx context.Context, req *pb.DeleteAuthorRequest) (*pb.DeleteAuthorReply, error) {
	if err := s.repo.DB.WithContext(ctx).Delete(&models.Author{}, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.DeleteAuthorReply{Message: "Success"}, nil
}

func (s *AuthorService) ListAuthor(ctx context.Context, req *pb.ListAuthorRequest) (*pb.ListAuthorReply, error) {
	var results []models.Author
	var total int64
	
	db := s.repo.DB.WithContext(ctx).Model(&models.Author{})
	db.Count(&total)
	
	offset := (req.Page - 1) * req.PageSize
	if err := db.Limit(int(req.PageSize)).Offset(int(offset)).Find(&results).Error; err != nil {
		return nil, err
	}
	
	pbResults := make([]*pb.Author, len(results))
	for i, r := range results {
		pbResults[i] = mapAuthorToPb(&r)
	}
	
	return &pb.ListAuthorReply{
		Results: pbResults,
		Total:   total,
	}, nil
}

func mapAuthorToPb(m *models.Author) *pb.Author {
	return &pb.Author{
		Id: uint64(m.ID),
		Name: m.Name,
		CreatedAt: timestamppb.New(m.CreatedAt),
		UpdatedAt: timestamppb.New(m.UpdatedAt),
	}
}
