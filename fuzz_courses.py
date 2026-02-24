import requests
import time

# Target the Next.js local development server
BASE_URL = "http://localhost:3000/api/courses"

# A list of malicious, strange, or boundary-testing inputs for the "full" parameter
PAYLOADS = [
    # 1. Expected/Normal values
    "1", 
    "0", 
    "",
    
    # 2. Type confusion / Strings instead of numbers
    "true",
    "false",
    "yes",
    "null",
    "undefined",
    
    # 3. Boundary / Unexpected numbers
    "-1",
    "99999999999999999999999999999999", # Integer overflow attempt
    "1.5",
    
    # 4. Extremely long inputs (Buffer overflow / memory exhaustion attempt)
    "A" * 10000, 
    
    # 5. SQL Injection & URL manipulation payloads
    "1' OR '1'='1",
    "1; DROP TABLE courses;",
    "1%00", # Null byte injection
    "../../etc/passwd", # Path traversal attempt
    
    # 6. Weird Encoding / Unicode
    "%E2%82%AC", # Euro symbol URL encoded
    "👩‍💻",      # Emoji
    "\\\u0000",  # Escaped null byte
]

def run_fuzzer():
    print(f"Starting Fuzzer against: {BASE_URL}")
    print("-" * 50)
    
    bugs_found = 0
    total_requests = len(PAYLOADS)
    
    for i, payload in enumerate(PAYLOADS):
        # We pass the payload into the ?full= parameter
        params = {"full": payload}
        
        try:
            # Send the GET request
            start_time = time.time()
            response = requests.get(BASE_URL, params=params, timeout=5)
            elapsed = time.time() - start_time
            
            status = response.status_code
            
            # --- EVALUATE THE RESPONSE (The Oracle) ---
            
            # If the server crashed (500) or caught fire, that's a bug!
            if status >= 500:
                print(f"❌ BUG FOUND! Status {status}")
                print(f"   Payload: {payload[:50]}...")
                bugs_found += 1
                
            # If it took way too long to respond, it might be a ReDoS or memory issue
            elif elapsed > 3.0: 
                print(f"⚠️  WARNING: Request took {elapsed:.2f}s (Performance Issue?)")
                print(f"   Payload: {payload[:50]}...")
                
            # Otherwise, the server handled it safely (either 200 OK or 400 Bad Request)
            else:
                print(f"✅ Safe (Status {status}): Payload length {len(payload)}")
                
        # If the request actually failed to connect (Next.js completely died)
        except requests.exceptions.RequestException as e:
            print(f"🛑 CRITICAL FAILURE: The server stopped responding entirely!")
            print(f"   Error: {e}")
            print(f"   Payload was: {payload[:50]}...")
            bugs_found += 1
            break
            
        # Slight delay to not overwhelm the local server instantly
        time.sleep(0.1)

    print("-" * 50)
    print(f"Fuzzing Complete. Sent {total_requests} requests.")
    print(f"Total Bugs/Crashes Found: {bugs_found}")

if __name__ == "__main__":
    run_fuzzer()
