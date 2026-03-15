package service

import (
	"context"
	pb "go-duck/api/v1"
	"go-duck/internal/repository"
	"go-duck/models"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type ArticleService struct {
	pb.UnimplementedArticleServiceServer
	repo *repository.Repository
}

func NewArticleService(repo *repository.Repository) *ArticleService {
	return &ArticleService{repo: repo}
}

func (s *ArticleService) CreateArticle(ctx context.Context, req *pb.CreateArticleRequest) (*pb.ArticleReply, error) {
	entity := &models.Article{
		Title: req.Title,
		Content: req.Content,
		Status: models.ArticleStatus(req.Status),
		PublishedDate: req.PublishedDate,
	}
	if err := s.repo.DB.WithContext(ctx).Create(entity).Error; err != nil {
		return nil, err
	}
	return &pb.ArticleReply{
		Data: mapArticleToPb(entity),
	}, nil
}

func (s *ArticleService) GetArticle(ctx context.Context, req *pb.GetArticleRequest) (*pb.ArticleReply, error) {
	var entity models.Article
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.ArticleReply{
		Data: mapArticleToPb(&entity),
	}, nil
}

func (s *ArticleService) UpdateArticle(ctx context.Context, req *pb.UpdateArticleRequest) (*pb.ArticleReply, error) {
	var entity models.Article
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	
	entity.Title = req.Title
	entity.Content = req.Content
	entity.Status = models.ArticleStatus(req.Status)
	entity.PublishedDate = req.PublishedDate

	if err := s.repo.DB.WithContext(ctx).Save(&entity).Error; err != nil {
		return nil, err
	}
	return &pb.ArticleReply{
		Data: mapArticleToPb(&entity),
	}, nil
}

func (s *ArticleService) DeleteArticle(ctx context.Context, req *pb.DeleteArticleRequest) (*pb.DeleteArticleReply, error) {
	if err := s.repo.DB.WithContext(ctx).Delete(&models.Article{}, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.DeleteArticleReply{Message: "Success"}, nil
}

func (s *ArticleService) ListArticle(ctx context.Context, req *pb.ListArticleRequest) (*pb.ListArticleReply, error) {
	var results []models.Article
	var total int64
	
	db := s.repo.DB.WithContext(ctx).Model(&models.Article{})
	db.Count(&total)
	
	offset := (req.Page - 1) * req.PageSize
	if err := db.Limit(int(req.PageSize)).Offset(int(offset)).Find(&results).Error; err != nil {
		return nil, err
	}
	
	pbResults := make([]*pb.Article, len(results))
	for i, r := range results {
		pbResults[i] = mapArticleToPb(&r)
	}
	
	return &pb.ListArticleReply{
		Results: pbResults,
		Total:   total,
	}, nil
}

func mapArticleToPb(m *models.Article) *pb.Article {
	return &pb.Article{
		Id: uint64(m.ID),
		Title: m.Title,
		Content: m.Content,
		Status: string(m.Status),
		PublishedDate: m.PublishedDate,
		CreatedAt: timestamppb.New(m.CreatedAt),
		UpdatedAt: timestamppb.New(m.UpdatedAt),
	}
}
