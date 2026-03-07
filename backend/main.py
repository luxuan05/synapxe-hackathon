from fastapi import FastAPI

from database import Base, engine
import models

app = FastAPI()


@app.on_event("startup")
def create_tables():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"message": "Backend running"}