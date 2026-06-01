# Placeholder for database models (PostgreSQL via SQLAlchemy)
from sqlalchemy.orm import declarative_base
from sqlalchemy import Column, Integer, String, DateTime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
