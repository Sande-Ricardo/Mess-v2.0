import { Injectable } from '@angular/core';
import { Observable, from, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CloudinaryUploadResponse {
  secureUrl: string;
  publicId: string;
}

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private readonly cloudName = environment.cloudinary.cloudName;
  private readonly uploadPreset = environment.cloudinary.uploadPreset;

  /**
   * Uploads a file to Cloudinary using the Unsigned Upload API.
   * @param file The file to upload
   * @param folder The destination folder in Cloudinary
   * @returns An Observable with the secure URL and public ID of the uploaded file
   */
  public uploadFile(file: File, folder: string): Observable<CloudinaryUploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', folder);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/auto/upload`;

    const fetchPromise = fetch(uploadUrl, {
      method: 'POST',
      body: formData
    }).then(async response => {
      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const serverMsg = errData?.error?.message || response.statusText;
        console.error('Cloudinary Rejection:', errData);
        throw new Error(`Cloudinary upload failed: ${serverMsg}`);
      }
      return response.json();
    });

    return from(fetchPromise).pipe(
      map(data => ({
        secureUrl: data.secure_url,
        publicId: data.public_id
      }))
    );
  }
}
