\# Cloud-Native Photo Gallery Application



\## Project Overview



This project is a full-stack cloud-native Photo Gallery web application built using Node.js, Express.js, Azure Cosmos DB, Azure Blob Storage, Azure Logic Apps, and a HTML/CSS/Vanilla JavaScript frontend.



The application allows users to add photos by image URL, upload image files, view photos in a gallery, search and filter photos, and edit photo metadata.



The main goal of this project was to move Azure Cosmos DB CRUD operations away from direct SDK access in the backend and instead perform Cosmos DB operations through Azure Logic Apps APIs.



\---



\## Final Architecture



The final architecture for photo metadata operations is:



```text

Frontend → Express Backend → Azure Logic Apps → Azure Cosmos DB

```



Image file upload uses:



```text

Frontend → Express Backend → Azure Blob Storage

```



After an image is uploaded to Azure Blob Storage, the Express backend sends the image metadata to Azure Logic Apps, which stores the metadata in Azure Cosmos DB.



\---



\## Technologies Used



\- Node.js

\- Express.js

\- Azure Cosmos DB

\- Azure Blob Storage

\- Azure Logic Apps

\- Multer

\- HTML

\- CSS

\- Vanilla JavaScript

\- dotenv



\---



\## Azure Services Used



\### Azure Cosmos DB



Azure Cosmos DB is used to store photo metadata.



Database name:



```text

photo-gallery-db

```



Container name:



```text

photos

```



Partition key:



```text

/category

```



Example Cosmos DB document:



```json

{

&#x20; "id": "test-001",

&#x20; "title": "Test image",

&#x20; "category": "test",

&#x20; "imageUrl": "https://example.com/test.jpg",

&#x20; "description": "Sample photo",

&#x20; "tags": "trip",

&#x20; "sourceType": "url",

&#x20; "isFavorite": 0,

&#x20; "visibility": "private",

&#x20; "createdAt": "2026-05-07T10:30:00Z",

&#x20; "updatedAt": "2026-05-07T10:30:00Z"

}

```



\### Azure Blob Storage



Azure Blob Storage is used to store uploaded image files.



The Express backend uploads image files directly to Azure Blob Storage using the Azure Storage SDK. After the upload is complete, the returned Blob Storage URL is saved as part of the photo metadata in Cosmos DB through Azure Logic Apps.



\### Azure Logic Apps



Azure Logic Apps are used as middleware APIs between the Express backend and Azure Cosmos DB.



The backend calls Logic App HTTP trigger URLs instead of directly using the Cosmos DB SDK for metadata operations.



Implemented Logic Apps:



```text

CREATE Logic App

READ Logic App

UPDATE Logic App

DELETE Logic App

```



CREATE, READ, and UPDATE are working successfully.



DELETE was investigated but temporarily skipped because Cosmos DB delete operations require both the document id and the correct partition key value. Since the Cosmos DB container uses `/category` as the partition key, the delete workflow must pass both `id` and `category` correctly.



\---



\## Features



\### Working Features



\- View photo gallery

\- Add photo by image URL

\- Upload image to Azure Blob Storage

\- Save uploaded image metadata to Cosmos DB through Logic Apps

\- Read photo metadata from Cosmos DB through Logic Apps

\- Edit photo metadata from the frontend

\- Update photo metadata in Cosmos DB through Logic Apps

\- Search photos

\- Filter photos by category, visibility, favorite status, tag, and source type

\- Store metadata such as title, category, description, tags, visibility, favorite status, image URL, and timestamps



\### Temporarily Disabled Feature



\- Delete photo



The delete feature is currently skipped because the Cosmos DB Logic App delete action requires both:



```text

document id

partition key value

```



The Cosmos DB partition key is:



```text

/category

```



The delete workflow was tested, but partition key handling caused errors, so it was excluded from the final working demo to keep the application stable.



\---



\## Project Structure



```text

cloud-native-development/

│

├── server.js

├── cosmos.js

├── package.json

├── package-lock.json

├── .env

├── .gitignore

├── home.html

├── gallery.html

├── upload.html

├── albums.html

├── features.html

├── about.html

├── contact.html

├── theme.css

├── theme.js

├── azureBlob.js

├── database.js

├── seed.js

├── Dockerfile

└── README.md

```



\---



\## Environment Variables



Create a `.env` file in the project root.



Example:



```env

PORT=3000



AZURE\_STORAGE\_CONNECTION\_STRING=your\_azure\_blob\_storage\_connection\_string

AZURE\_STORAGE\_CONTAINER=photos



LOGIC\_CREATE=your\_create\_logic\_app\_http\_url

LOGIC\_READ=your\_read\_logic\_app\_http\_url

LOGIC\_UPDATE=your\_update\_logic\_app\_http\_url

LOGIC\_DELETE=



LOGIC\_APP\_TIMEOUT\_MS=30000

```



Important:



The `.env` file contains private Azure secrets and should not be uploaded to GitHub or included in screenshots.



\---



\## Installation



Install dependencies:



```bash

npm install

```



Main required packages:



```bash

npm install express dotenv multer @azure/storage-blob

```



\---



\## Running the Application



Start the server:



```bash

node server.js

```



Expected terminal output:



```text

Server running on port 3000

Health check: http://localhost:3000/api/health

Photos API: http://localhost:3000/api/photos

```



Open the application in the browser:



```text

http://localhost:3000

```



Gallery page:



```text

http://localhost:3000/gallery.html

```



Upload page:



```text

http://localhost:3000/upload.html

```



\---



\## API Endpoints



\### Health Check



```http

GET /api/health

```



This checks whether the Express server is running.



\---



\### Get All Photos



```http

GET /api/photos

```



Flow:



```text

Express Backend → Logic App READ → Azure Cosmos DB

```



This endpoint returns all photo metadata documents from Cosmos DB.



\---



\### Get Photo By ID



```http

GET /api/photos/:id

```



This endpoint finds a specific photo by id.



\---



\### Create Photo By URL



```http

POST /api/photos

```



Example request body:



```json

{

&#x20; "title": "Sample Photo",

&#x20; "category": "test",

&#x20; "imageUrl": "https://example.com/photo.jpg",

&#x20; "description": "Created through Express and Logic Apps"

}

```



Flow:



```text

Frontend → Express Backend → Logic App CREATE → Azure Cosmos DB

```



\---



\### Upload Photo



```http

POST /api/photos/upload

```



This route uploads the image file to Azure Blob Storage first, then saves the image metadata through the CREATE Logic App.



Flow:



```text

Frontend → Express Backend → Azure Blob Storage

Frontend → Express Backend → Logic App CREATE → Azure Cosmos DB

```



\---



\### Update Photo



```http

PUT /api/photos/:id

```



Example request body:



```json

{

&#x20; "title": "Updated Photo Title",

&#x20; "category": "test",

&#x20; "description": "Updated through the frontend edit form"

}

```



Flow:



```text

Frontend → Express Backend → Logic App UPDATE → Azure Cosmos DB

```



\---



\### Delete Photo



```http

DELETE /api/photos/:id

```



Current status:



```text

Temporarily skipped

```



Reason:



Azure Cosmos DB delete operations require the document id and partition key value. Since this project uses `/category` as the partition key, the DELETE Logic App must receive and pass both `id` and `category`.



\---



\## Logic App Integration



The backend uses `fetch()` inside `cosmos.js` to call Azure Logic App HTTP trigger URLs.



The following functions are implemented in `cosmos.js`:



```js

getAllPhotos()

createPhoto(photo)

updatePhoto(id, updates)

deletePhoto(id, category)

```



The Express backend imports these functions:



```js

const {

&#x20; getAllPhotos,

&#x20; createPhoto,

&#x20; updatePhoto,

&#x20; deletePhoto

} = require("./cosmos");

```



This keeps the backend routes clean and allows Cosmos DB operations to be handled through Azure Logic Apps.



\---



\## Testing



\### Test Server Health



```powershell

Invoke-RestMethod http://localhost:3000/api/health

```



\### Test READ



```powershell

Invoke-RestMethod http://localhost:3000/api/photos

```



\### Test CREATE



```powershell

Invoke-RestMethod -Method POST http://localhost:3000/api/photos -ContentType "application/json" -Body '{"title":"Final create test","category":"test","imageUrl":"https://example.com/final.jpg","description":"Final assignment test"}'

```



\### Test UPDATE



Replace `YOUR\_PHOTO\_ID` with an existing photo id:



```powershell

Invoke-RestMethod -Method PUT http://localhost:3000/api/photos/YOUR\_PHOTO\_ID -ContentType "application/json" -Body '{"title":"Updated final test","category":"test","description":"Updated through Logic App"}'

```



\### Test Upload From Browser



Open:



```text

http://localhost:3000/upload.html

```



Upload an image file, enter title/category/description, and submit.



Then open:



```text

http://localhost:3000/gallery.html

```



The uploaded image should appear in the gallery.



\---



\## Final Working Status



```text

Frontend gallery display                 Working

Create photo by URL                      Working

Upload image to Azure Blob Storage       Working

Save upload metadata through Logic Apps  Working

Read from Cosmos DB through Logic Apps   Working

Update through Logic Apps                Working

Frontend edit form                       Working

Delete                                   Temporarily skipped

```



\---



\## Known Issue



The DELETE operation is not included in the final working demo.



Reason:



The Cosmos DB container uses `/category` as the partition key. Cosmos DB delete operations require both the document id and the correct partition key value. The delete workflow was tested but produced partition key related issues, so it was skipped to keep the final application stable.



Future improvement:



Update the DELETE Logic App to accept this request body:



```json

{

&#x20; "id": "photo-id",

&#x20; "category": "photo-category"

}

```



Then pass these values to the Cosmos DB delete action:



```text

Document ID = id

Partition key value = category

```



\---



\## Security Notes



The `.env` file contains private Azure connection strings and Logic App URLs.



The following files and folders should not be committed publicly:



```text

.env

node\_modules/

uploads/

storage.db

```



A `.gitignore` file is included to prevent sensitive and unnecessary files from being uploaded.



\---



\## Conclusion



This project successfully demonstrates a cloud-native full-stack photo gallery application using Azure services.



The application integrates a frontend, an Express.js backend, Azure Blob Storage, Azure Logic Apps, and Azure Cosmos DB.



The main achievement of the project is that Cosmos DB create, read, and update operations are handled through Azure Logic Apps instead of direct backend SDK access.



The application can upload images, store image files in Azure Blob Storage, save metadata in Azure Cosmos DB, display photos in a gallery, and update photo details through the frontend.

