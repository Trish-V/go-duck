package service

import (
	"context"
	pb "go-duck/api/v1"
	"go-duck/internal/repository"
	"go-duck/models"
	"gorm.io/datatypes"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type CarService struct {
	pb.UnimplementedCarServiceServer
	repo *repository.Repository
}

func NewCarService(repo *repository.Repository) *CarService {
	return &CarService{repo: repo}
}

func (s *CarService) CreateCar(ctx context.Context, req *pb.CreateCarRequest) (*pb.CarReply, error) {
	entity := &models.Car{
		Name: req.Name,
				Model: req.Model,
				Year: int(req.Year),
				Price: float64(req.Price),
				Color: req.Color,
				Features: datatypes.JSON(req.Features),
	}
	if err := s.repo.DB.WithContext(ctx).Create(entity).Error; err != nil {
		return nil, err
	}
	return &pb.CarReply{
		Data: mapCarToPb(entity),
	}, nil
}

func (s *CarService) GetCar(ctx context.Context, req *pb.GetCarRequest) (*pb.CarReply, error) {
	var entity models.Car
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.CarReply{
		Data: mapCarToPb(&entity),
	}, nil
}

func (s *CarService) UpdateCar(ctx context.Context, req *pb.UpdateCarRequest) (*pb.CarReply, error) {
	var entity models.Car
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	
	entity.Name = req.Name
		entity.Model = req.Model
		entity.Year = int(req.Year)
		entity.Price = float64(req.Price)
		entity.Color = req.Color
		entity.Features = datatypes.JSON(req.Features)

	if err := s.repo.DB.WithContext(ctx).Save(&entity).Error; err != nil {
		return nil, err
	}
	return &pb.CarReply{
		Data: mapCarToPb(&entity),
	}, nil
}

func (s *CarService) DeleteCar(ctx context.Context, req *pb.DeleteCarRequest) (*pb.DeleteCarReply, error) {
	if err := s.repo.DB.WithContext(ctx).Delete(&models.Car{}, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.DeleteCarReply{Message: "Success"}, nil
}

func (s *CarService) ListCar(ctx context.Context, req *pb.ListCarRequest) (*pb.ListCarReply, error) {
	var results []models.Car
	var total int64
	
	db := s.repo.DB.WithContext(ctx).Model(&models.Car{})
	db.Count(&total)
	
	offset := (req.Page - 1) * req.PageSize
	if err := db.Limit(int(req.PageSize)).Offset(int(offset)).Find(&results).Error; err != nil {
		return nil, err
	}
	
	pbResults := make([]*pb.Car, len(results))
	for i, r := range results {
		pbResults[i] = mapCarToPb(&r)
	}
	
	return &pb.ListCarReply{
		Results: pbResults,
		Total:   total,
	}, nil
}

func mapCarToPb(m *models.Car) *pb.Car {
	return &pb.Car{
		Id: uint64(m.ID),
		Name: m.Name,
				Model: m.Model,
				Year: int32(m.Year),
				Price: float64(m.Price),
				Color: m.Color,
				Features: string(m.Features),
		CreatedAt: timestamppb.New(m.CreatedDate),
		UpdatedAt: timestamppb.New(m.LastModifiedDate),
	}
}
