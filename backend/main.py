from fastapi import FastAPI, HTTPException, Depends, File, UploadFile, Header, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import supabase
from datetime import datetime, date, timedelta
import os
from dotenv import load_dotenv, find_dotenv
import aiofiles
from uuid import UUID  # Add this import at the top

app = FastAPI()

# Configure CORS with more permissive settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:19006",
        "http://localhost:19000",
        "exp://localhost:19000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost",
        "http://127.0.0.1",
        "*"  # temporarily allow all origins for testing
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    allow_origin_regex="https?://.*"  # Allow any HTTP/HTTPS origin for development
)

# Initialize Supabase client



client = supabase.create_client(supabase_url, supabase_key)

class UserProfile(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

class UserLogin(BaseModel):
    email: str
    password: str

class UserRegister(BaseModel):
    email: str
    password: str

# Add this class for weight logging request validation
class WeightLog(BaseModel):
    weight: float
    log_date: date | None = None

@app.get("/")
async def read_root():
    return {"message": "Don't Eat Kebab API"}

# Add this function to get the user from the auth token
async def get_current_user(authorization: str = Header(None)):
    print("Auth header received:", authorization)  # Debug log
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated - No auth header")
    
    try:
        token = authorization.split(" ")[1]  # Get token from "Bearer <token>"
        print("Token extracted:", token[:10] + "...")  # Debug log
        
        # Changed this part to handle the response correctly
        user_response = client.auth.get_user(token)
        print("Auth response:", user_response)  # Debug log
        
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
            
        return user_response.user
        
    except Exception as e:
        print("Auth error:", str(e))  # Debug log
        raise HTTPException(status_code=401, detail=f"Invalid authentication credentials: {str(e)}")

@app.get("/api/profile/{user_id}")
async def get_profile(user_id: str, current_user = Depends(get_current_user)):
    try:
        print(f"Getting profile for user: {user_id}")  # Debug log
        print(f"Current authenticated user: {current_user.id}")  # Debug log
        
        if user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to view this profile")

        # Get profile from database
        response = client.table('profiles').select("*").eq('id', user_id).single().execute()
        print("Database response:", response)  # Debug log
        
        if not response.data:
            # Create profile if it doesn't exist
            data = {
                "id": user_id,
                "email": current_user.email,
                "username": current_user.email.split('@')[0],  # Default username from email
                "full_name": "",
                "avatar_url": None,
                "updated_at": datetime.utcnow().isoformat()
            }
            response = client.table('profiles').insert(data).execute()
            if not response.data:
                raise HTTPException(status_code=404, detail="Failed to create profile")
            
        # Use the authenticated user's email
        profile_data = response.data[0] if isinstance(response.data, list) else response.data
        profile_data['email'] = current_user.email
        
        return profile_data
        
    except Exception as e:
        print(f"Error in get_profile: {str(e)}")  # Debug log
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/profile/{user_id}")
async def update_profile(user_id: str, profile: UserProfile):
    try:
        data = {
            "id": user_id,
            "username": profile.username,
            "full_name": profile.full_name,
            "avatar_url": profile.avatar_url,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        response = client.table('profiles').upsert(data).execute()
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login")
async def login(user_data: UserLogin):
    try:
        response = client.auth.sign_in_with_password({
            "email": user_data.email,
            "password": user_data.password
        })
        return {
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": response.user
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/register")
async def register(user_data: UserRegister):
    try:
        response = client.auth.sign_up({
            "email": user_data.email,
            "password": user_data.password
        })
        return {
            "message": "Registration successful",
            "user": response.user
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/profile/{user_id}/avatar")
async def upload_avatar(
    user_id: str, 
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    try:
        print(f"Uploading avatar for user: {user_id}")
        print(f"File details:")
        print(f"- Filename: {file.filename}")
        print(f"- Content type: {file.content_type}")
        print(f"- Headers: {file.headers}")
        
        if user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this profile")

        if not file:
            raise HTTPException(status_code=400, detail="No file provided")

        # Verify file type
        allowed_types = ["image/jpeg", "image/png", "image/jpg"]
        content_type = file.content_type or "image/jpeg"
        print(f"Content type: {content_type}")

        if content_type not in allowed_types:
            raise HTTPException(
                status_code=400, 
                detail=f"File type {content_type} not allowed. Allowed types: {', '.join(allowed_types)}"
            )

        # Get file extension
        ext_map = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png"
        }
        file_ext = ext_map.get(content_type, ".jpg")
        file_name = f"{user_id}{file_ext}"
        
        # Read and verify file content
        file_content = await file.read()
        content_length = len(file_content)
        print(f"File content length: {content_length} bytes")

        if content_length == 0:
            raise HTTPException(status_code=400, detail="File is empty")
        if content_length > 5 * 1024 * 1024:  # 5MB limit
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB")

        try:
            # Upload to Supabase Storage
            print("Uploading to Supabase Storage...")
            response = client.storage.from_('avatars').upload(
                path=file_name,
                file=file_content,
                file_options={
                    "content-type": content_type,
                    "upsert": True
                }
            )
            
            print(f"Storage response: {response}")
            
            if hasattr(response, 'error') and response.error:
                print(f"Storage upload error: {response.error}")
                raise HTTPException(status_code=500, detail=str(response.error))

            # Get public URL
            public_url = client.storage.from_('avatars').get_public_url(file_name)
            print(f"Public URL generated: {public_url}")

            # Update profile
            profile_data = {
                "id": user_id,
                "avatar_url": public_url,
                "updated_at": datetime.utcnow().isoformat()
            }
            
            update_response = client.table('profiles').update(profile_data).eq('id', user_id).execute()
            print(f"Profile update response: {update_response}")

            if not update_response.data:
                raise HTTPException(status_code=500, detail="Failed to update profile with avatar URL")

            return {"avatar_url": public_url}
            
        except Exception as e:
            print(f"Storage operation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Storage operation failed: {str(e)}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        print(f"Avatar upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 

@app.post("/api/weight")
async def log_weight(
    weight_data: WeightLog,
    current_user = Depends(get_current_user)
):
    try:
        if weight_data.weight <= 0 or weight_data.weight >= 1000:
            raise HTTPException(status_code=400, detail="Weight must be between 0 and 1000 kg")

        log_date = weight_data.log_date or date.today()
            
        # Debug logging
        print(f"Current user ID: {current_user.id}")
        print(f"Weight: {weight_data.weight}")
        print(f"Date: {log_date}")
        
        data = {
            "user_id": current_user.id,
            "weight": float(weight_data.weight),
            "log_date": log_date.isoformat()
        }
        
        print(f"Upserting weight data: {data}")
        
        # Use upsert with on_conflict parameter
        response = client.table('weight_logs')\
            .upsert(
                data,
                on_conflict='user_id,log_date'  # Specify the unique constraint columns
            )\
            .execute()
            
        print(f"Upsert response: {response}")
        
        if not response.data:
            raise HTTPException(status_code=500, detail="Failed to log weight")
            
        return response.data[0]
        
    except Exception as e:
        print(f"Error logging weight: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/weight/{user_id}")
async def get_weight_logs(
    user_id: str,
    start_date: date = None,
    end_date: date = None,
    current_user = Depends(get_current_user)
):
    try:
        query = client.table('weight_logs').select("*").eq('user_id', user_id)
        
        if start_date:
            query = query.gte('log_date', start_date.isoformat())
        if end_date:
            query = query.lte('log_date', end_date.isoformat())
            
        response = query.order('log_date', desc=True).execute()
        return response.data
        
    except Exception as e:
        print(f"Error getting weight logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/users")
async def get_users(current_user = Depends(get_current_user), date: str = None):
    try:
        # Get all profiles
        profiles_response = client.table('profiles').select("*").execute()
        
        if not profiles_response.data:
            return []
            
        # Get weights for the specified date (or today if not specified)
        target_date = date or date.today().isoformat()
        print(f"Getting weights for date: {target_date}")
        
        weights_response = client.table('weight_logs')\
            .select("*")\
            .eq('log_date', target_date)\
            .execute()
            
        # Create a map of user_id to weight
        weights_map = {
            w['user_id']: w['weight'] 
            for w in weights_response.data
        } if weights_response.data else {}
        
        # Combine profiles with weights
        users = []
        for profile in profiles_response.data:
            user_id = profile['id']
            if user_id in weights_map:
                profile['weight_logs'] = [{
                    'weight': weights_map[user_id],
                    'log_date': target_date
                }]
            users.append(profile)
            
        return users
        
    except Exception as e:
        print(f"Error getting users: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 