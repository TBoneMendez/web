from pydantic import BaseModel

class FunFactIn(BaseModel):
    text: str

class FunFact(BaseModel):
    id: int
    text: str
