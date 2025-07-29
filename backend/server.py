from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from authlib.integrations.starlette_client import OAuth
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import aiohttp

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Google OAuth configuration
GOOGLE_CLIENT_ID = "299997586034-mhodfugm8vhgs4hf646mhaek0ipqic7d.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET = "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"
YOUTUBE_API_KEY = "AIzaSyA6xxhNsUwgZTpqUTsMIFKZf1MTtqnv1MU"

# YouTube API configuration
YOUTUBE_API_SERVICE_NAME = "youtube"
YOUTUBE_API_VERSION = "v3"

# JWT Secret for session management
JWT_SECRET = "your-secret-key-change-in-production"

# Create the main app
app = FastAPI()

# Add session middleware for OAuth
app.add_middleware(SessionMiddleware, secret_key="your-session-secret")

# OAuth setup
oauth = OAuth()
oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": "openid email profile https://www.googleapis.com/auth/youtube.readonly"
    }
)

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()

# Pydantic Models
class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    google_id: str
    email: str
    name: str
    picture: Optional[str] = None
    access_token: str
    refresh_token: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Subscription(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    channel_id: str
    channel_title: str
    channel_description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    subscriber_count: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Video(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    video_id: str
    channel_id: str
    channel_title: str
    title: str
    description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    published_at: datetime
    view_count: Optional[int] = None
    duration: Optional[str] = None

class AuthResponse(BaseModel):
    access_token: str
    user: Dict[str, Any]

# Helper Functions
def get_youtube_service(api_key: str = None):
    """Get YouTube service with API key"""
    return build(
        YOUTUBE_API_SERVICE_NAME,
        YOUTUBE_API_VERSION,
        developerKey=api_key or YOUTUBE_API_KEY,
        cache_discovery=False
    )

def get_youtube_service_with_oauth(credentials):
    """Get YouTube service with OAuth credentials"""
    return build(
        YOUTUBE_API_SERVICE_NAME,
        YOUTUBE_API_VERSION,
        credentials=credentials,
        cache_discovery=False
    )

def create_access_token(data: dict):
    """Create JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm="HS256")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current user from JWT token"""
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        
        user = await db.users.find_one({"id": user_id})
        if user is None:
            raise HTTPException(status_code=401, detail="User not found")
        
        return User(**user)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

# Authentication Routes
@api_router.get("/auth/login")
async def login(request: Request):
    """Initiate Google OAuth login"""
    redirect_uri = request.url_for("auth_callback")
    return await oauth.google.authorize_redirect(request, redirect_uri)

@api_router.get("/auth/google")
async def auth_callback(request: Request):
    """Handle OAuth callback"""
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get("userinfo")
        
        if not user_info:
            raise HTTPException(status_code=400, detail="Failed to get user info")
        
        # Check if user exists
        existing_user = await db.users.find_one({"google_id": user_info["sub"]})
        
        if existing_user:
            # Update existing user
            updated_user = User(
                **existing_user,
                access_token=token["access_token"],
                refresh_token=token.get("refresh_token"),
                updated_at=datetime.utcnow()
            )
            await db.users.update_one(
                {"google_id": user_info["sub"]},
                {"$set": updated_user.dict()}
            )
            user_data = updated_user
        else:
            # Create new user
            user_data = User(
                google_id=user_info["sub"],
                email=user_info["email"],
                name=user_info["name"],
                picture=user_info.get("picture"),
                access_token=token["access_token"],
                refresh_token=token.get("refresh_token")
            )
            await db.users.insert_one(user_data.dict())
        
        # Create JWT token
        access_token = create_access_token({"user_id": user_data.id, "google_id": user_data.google_id})
        
        # Return redirect with token (frontend will handle this)
        return {
            "access_token": access_token,
            "user": {
                "id": user_data.id,
                "name": user_data.name,
                "email": user_data.email,
                "picture": user_data.picture
            }
        }
        
    except Exception as e:
        logger.error(f"OAuth callback error: {str(e)}")
        raise HTTPException(status_code=400, detail="Authentication failed")

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(get_current_user)):
    """Get current authenticated user"""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "picture": current_user.picture
    }

# YouTube Integration Routes
@api_router.get("/subscriptions")
async def get_subscriptions(current_user: User = Depends(get_current_user)):
    """Get user's YouTube subscriptions"""
    try:
        # Create YouTube service with user's access token
        from google.auth.transport.requests import Request as GoogleRequest
        from google.oauth2.credentials import Credentials
        
        # Create credentials object
        creds = Credentials(
            token=current_user.access_token,
            refresh_token=current_user.refresh_token,
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET
        )
        
        youtube = build(YOUTUBE_API_SERVICE_NAME, YOUTUBE_API_VERSION, credentials=creds)
        
        # Get user's subscriptions
        subscriptions = []
        next_page_token = None
        
        while True:
            request = youtube.subscriptions().list(
                part="snippet,contentDetails",
                mine=True,
                maxResults=50,
                pageToken=next_page_token
            )
            response = request.execute()
            
            for item in response.get("items", []):
                snippet = item["snippet"]
                channel_id = snippet["resourceId"]["channelId"]
                
                subscription = Subscription(
                    user_id=current_user.id,
                    channel_id=channel_id,
                    channel_title=snippet["title"],
                    channel_description=snippet["description"],
                    thumbnail_url=snippet["thumbnails"]["default"]["url"]
                )
                
                subscriptions.append(subscription)
                
                # Store/update subscription in database
                await db.subscriptions.update_one(
                    {"user_id": current_user.id, "channel_id": channel_id},
                    {"$set": subscription.dict()},
                    upsert=True
                )
            
            next_page_token = response.get("nextPageToken")
            if not next_page_token:
                break
        
        return {"subscriptions": [sub.dict() for sub in subscriptions]}
        
    except HttpError as e:
        logger.error(f"YouTube API error: {str(e)}")
        raise HTTPException(status_code=400, detail="Failed to fetch subscriptions")
    except Exception as e:
        logger.error(f"Error fetching subscriptions: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.get("/subscription-videos")
async def get_subscription_videos(
    max_results: int = 50,
    current_user: User = Depends(get_current_user)
):
    """Get latest videos from user's subscribed channels"""
    try:
        # Get user's subscriptions from database
        subscriptions = await db.subscriptions.find({"user_id": current_user.id}).to_list(1000)
        
        if not subscriptions:
            return {"videos": []}
        
        # Create YouTube service with API key for public data
        youtube = get_youtube_service()
        
        all_videos = []
        
        # Get latest videos from each subscribed channel
        for subscription in subscriptions[:10]:  # Limit to avoid quota issues
            try:
                # Get channel's latest videos
                search_request = youtube.search().list(
                    part="snippet",
                    channelId=subscription["channel_id"],
                    type="video",
                    order="date",
                    maxResults=5  # Get 5 latest videos per channel
                )
                search_response = search_request.execute()
                
                for item in search_response.get("items", []):
                    snippet = item["snippet"]
                    
                    video = Video(
                        video_id=item["id"]["videoId"],
                        channel_id=snippet["channelId"],
                        channel_title=snippet["channelTitle"],
                        title=snippet["title"],
                        description=snippet["description"],
                        thumbnail_url=snippet["thumbnails"]["high"]["url"],
                        published_at=datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00"))
                    )
                    
                    all_videos.append(video)
                    
            except HttpError as e:
                logger.warning(f"Error fetching videos for channel {subscription['channel_id']}: {str(e)}")
                continue
        
        # Sort videos by published date (newest first)
        all_videos.sort(key=lambda x: x.published_at, reverse=True)
        
        # Return limited results
        return {"videos": [video.dict() for video in all_videos[:max_results]]}
        
    except Exception as e:
        logger.error(f"Error fetching subscription videos: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@api_router.post("/refresh-subscriptions")
async def refresh_subscriptions(current_user: User = Depends(get_current_user)):
    """Manually refresh user's subscriptions"""
    try:
        # This will re-fetch and update subscriptions
        result = await get_subscriptions(current_user)
        return {"message": "Subscriptions refreshed successfully", "count": len(result["subscriptions"])}
    except Exception as e:
        logger.error(f"Error refreshing subscriptions: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to refresh subscriptions")

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()