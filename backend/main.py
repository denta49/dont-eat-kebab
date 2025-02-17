from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime, date
import os
from dotenv import load_dotenv, find_dotenv
import supabase
from werkzeug.utils import secure_filename
from functools import wraps

app = Flask(__name__)

# Configure CORS
CORS(app, resources={
    r"/*": {
        "origins": [
            "https://dietka.przemox49.usermd.net",
            "http://dietka.przemox49.usermd.net",
            "http://localhost:19006",
            "http://localhost:19000",
            "exp://localhost:19000",
        ],
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"],
        "supports_credentials": True,
        "max_age": 600
    }
})

# Load environment variables
load_dotenv(find_dotenv())

# Initialize Supabase client
supabase_url = os.getenv('SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_KEY')

if not supabase_url or not supabase_key:
    raise Exception("Missing required Supabase environment variables")

client = supabase.create_client(supabase_url, supabase_key)

# Authentication decorator
def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({"detail": "Not authenticated - No auth header"}), 401

        try:
            token = auth_header.split(" ")[1]
            user_response = client.auth.get_user(token)
            
            if not user_response.user:
                return jsonify({"detail": "Invalid or expired token"}), 401
                
            return f(user_response.user, *args, **kwargs)
            
        except Exception as e:
            return jsonify({"detail": f"Invalid authentication credentials: {str(e)}"}), 401
            
    return decorated

@app.route("/")
def home():
    return jsonify({"message": "Don't Eat Kebab API"})

@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        response = client.auth.sign_in_with_password({
            "email": data["email"],
            "password": data["password"]
        })
        return jsonify({
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
            "user": response.user
        })
    except Exception as e:
        return jsonify({"detail": str(e)}), 401

@app.route("/api/auth/register", methods=["POST"])
def register():
    try:
        data = request.get_json()
        response = client.auth.sign_up({
            "email": data["email"],
            "password": data["password"]
        })
        return jsonify({
            "message": "Registration successful",
            "user": response.user
        })
    except Exception as e:
        return jsonify({"detail": str(e)}), 400

@app.route("/api/profile/<user_id>", methods=["GET"])
@require_auth
def get_profile(current_user, user_id):
    try:
        if user_id != current_user.id:
            return jsonify({"detail": "Not authorized to view this profile"}), 403

        response = client.table('profiles').select("*").eq('id', user_id).single().execute()
        
        if not response.data:
            # Create profile if it doesn't exist
            data = {
                "id": user_id,
                "email": current_user.email,
                "username": current_user.email.split('@')[0],
                "full_name": "",
                "avatar_url": None,
                "updated_at": datetime.utcnow().isoformat()
            }
            response = client.table('profiles').insert(data).execute()
            if not response.data:
                return jsonify({"detail": "Failed to create profile"}), 404
            
        profile_data = response.data[0] if isinstance(response.data, list) else response.data
        profile_data['email'] = current_user.email
        
        return jsonify(profile_data)
        
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/profile/<user_id>", methods=["PUT"])
@require_auth
def update_profile(current_user, user_id):
    try:
        data = request.get_json()
        profile_data = {
            "id": user_id,
            "username": data.get("username"),
            "full_name": data.get("full_name"),
            "avatar_url": data.get("avatar_url"),
            "updated_at": datetime.utcnow().isoformat()
        }
        
        response = client.table('profiles').upsert(profile_data).execute()
        return jsonify(response.data)
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/profile/<user_id>/avatar", methods=["POST"])
@require_auth
def upload_avatar(current_user, user_id):
    try:
        if user_id != current_user.id:
            return jsonify({"detail": "Not authorized to update this profile"}), 403

        if 'file' not in request.files:
            return jsonify({"detail": "No file provided"}), 400

        file = request.files['file']
        if not file:
            return jsonify({"detail": "No file provided"}), 400

        # File validation
        allowed_types = ["image/jpeg", "image/png", "image/jpg"]
        content_type = file.content_type or "image/jpeg"

        if content_type not in allowed_types:
            return jsonify({"detail": f"File type not allowed. Allowed types: {', '.join(allowed_types)}"}), 400

        # Get file extension and create filename
        ext_map = {
            "image/jpeg": ".jpg",
            "image/jpg": ".jpg",
            "image/png": ".png"
        }
        file_ext = ext_map.get(content_type, ".jpg")
        file_name = f"{user_id}{file_ext}"

        # Upload to Supabase Storage
        response = client.storage.from_('avatars').upload(
            path=file_name,
            file=file.read(),
            file_options={"content-type": content_type, "upsert": True}
        )

        if hasattr(response, 'error') and response.error:
            return jsonify({"detail": str(response.error)}), 500

        # Get public URL
        public_url = client.storage.from_('avatars').get_public_url(file_name)

        # Update profile
        profile_data = {
            "id": user_id,
            "avatar_url": public_url,
            "updated_at": datetime.utcnow().isoformat()
        }
        
        update_response = client.table('profiles').update(profile_data).eq('id', user_id).execute()

        if not update_response.data:
            return jsonify({"detail": "Failed to update profile with avatar URL"}), 500

        return jsonify({"avatar_url": public_url})
            
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/weight", methods=["POST"])
@require_auth
def log_weight(current_user):
    try:
        data = request.get_json()
        weight = float(data["weight"])
        log_date = datetime.strptime(data.get("log_date", date.today().isoformat()), "%Y-%m-%d").date()

        if weight <= 0 or weight >= 1000:
            return jsonify({"detail": "Weight must be between 0 and 1000 kg"}), 400

        weight_data = {
            "user_id": current_user.id,
            "weight": weight,
            "log_date": log_date.isoformat()
        }
        
        response = client.table('weight_logs')\
            .upsert(weight_data, on_conflict='user_id,log_date')\
            .execute()
            
        if not response.data:
            return jsonify({"detail": "Failed to log weight"}), 500
            
        return jsonify(response.data[0])
        
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/weight/<user_id>", methods=["GET"])
@require_auth
def get_weight_logs(current_user, user_id):
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        query = client.table('weight_logs').select("*").eq('user_id', user_id)
        
        if start_date:
            query = query.gte('log_date', start_date)
        if end_date:
            query = query.lte('log_date', end_date)
            
        response = query.order('log_date', desc=True).execute()
        return jsonify(response.data)
        
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

@app.route("/api/users", methods=["GET"])
@require_auth
def get_users(current_user):
    try:
        date_param = request.args.get('date')
        target_date = date_param or date.today().isoformat()
        
        # Get all profiles
        profiles_response = client.table('profiles').select("*").execute()
        
        if not profiles_response.data:
            return jsonify([])
            
        # Get weights for the specified date
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
            
        return jsonify(users)
        
    except Exception as e:
        return jsonify({"detail": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True) 