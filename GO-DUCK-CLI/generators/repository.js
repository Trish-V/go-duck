import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export const generateRepositoryCode = async (outputDir) => {
    const repoDir = path.join(outputDir, 'internal', 'repository');
    await fs.ensureDir(repoDir);

    const repoGo = `package repository

import (
	"gorm.io/gorm"
)

type Repository struct {
	DB *gorm.DB
}

func NewRepository(db *gorm.DB) *Repository {
	return &Repository{
		DB: db,
	}
}
`;

    await fs.writeFile(path.join(repoDir, 'repository.go'), repoGo);
    console.log(chalk.gray('  Generated Internal Repository Layer'));
};
