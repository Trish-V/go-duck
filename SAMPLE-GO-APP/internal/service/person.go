package service

import (
	"context"
	pb "go-duck/api/v1"
	"go-duck/internal/repository"
	"go-duck/models"
	"gorm.io/datatypes"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type PersonService struct {
	pb.UnimplementedPersonServiceServer
	repo *repository.Repository
}

func NewPersonService(repo *repository.Repository) *PersonService {
	return &PersonService{repo: repo}
}

func (s *PersonService) CreatePerson(ctx context.Context, req *pb.CreatePersonRequest) (*pb.PersonReply, error) {
	entity := &models.Person{
		FirstName: req.FirstName,
		LastName: req.LastName,
		Email: req.Email,
		Age: int(req.Age),
		Preferences: datatypes.JSON(req.Preferences),
	}
	if err := s.repo.DB.WithContext(ctx).Create(entity).Error; err != nil {
		return nil, err
	}
	return &pb.PersonReply{
		Data: mapPersonToPb(entity),
	}, nil
}

func (s *PersonService) GetPerson(ctx context.Context, req *pb.GetPersonRequest) (*pb.PersonReply, error) {
	var entity models.Person
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.PersonReply{
		Data: mapPersonToPb(&entity),
	}, nil
}

func (s *PersonService) UpdatePerson(ctx context.Context, req *pb.UpdatePersonRequest) (*pb.PersonReply, error) {
	var entity models.Person
	if err := s.repo.DB.WithContext(ctx).First(&entity, req.Id).Error; err != nil {
		return nil, err
	}
	
	entity.FirstName = req.FirstName
	entity.LastName = req.LastName
	entity.Email = req.Email
	entity.Age = int(req.Age)
	entity.Preferences = datatypes.JSON(req.Preferences)

	if err := s.repo.DB.WithContext(ctx).Save(&entity).Error; err != nil {
		return nil, err
	}
	return &pb.PersonReply{
		Data: mapPersonToPb(&entity),
	}, nil
}

func (s *PersonService) DeletePerson(ctx context.Context, req *pb.DeletePersonRequest) (*pb.DeletePersonReply, error) {
	if err := s.repo.DB.WithContext(ctx).Delete(&models.Person{}, req.Id).Error; err != nil {
		return nil, err
	}
	return &pb.DeletePersonReply{Message: "Success"}, nil
}

func (s *PersonService) ListPerson(ctx context.Context, req *pb.ListPersonRequest) (*pb.ListPersonReply, error) {
	var results []models.Person
	var total int64
	
	db := s.repo.DB.WithContext(ctx).Model(&models.Person{})
	db.Count(&total)
	
	offset := (req.Page - 1) * req.PageSize
	if err := db.Limit(int(req.PageSize)).Offset(int(offset)).Find(&results).Error; err != nil {
		return nil, err
	}
	
	pbResults := make([]*pb.Person, len(results))
	for i, r := range results {
		pbResults[i] = mapPersonToPb(&r)
	}
	
	return &pb.ListPersonReply{
		Results: pbResults,
		Total:   total,
	}, nil
}

func mapPersonToPb(m *models.Person) *pb.Person {
	return &pb.Person{
		Id: uint64(m.ID),
		FirstName: m.FirstName,
		LastName: m.LastName,
		Email: m.Email,
		Age: int32(m.Age),
		Preferences: string(m.Preferences),
		CreatedAt: timestamppb.New(m.CreatedAt),
		UpdatedAt: timestamppb.New(m.UpdatedAt),
	}
}
