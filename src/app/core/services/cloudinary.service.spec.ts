import { HttpClientTestingModule } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CloudinaryService } from './cloudinary.service';

describe('CloudinaryService', () => {
  let service: CloudinaryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CloudinaryService]
    });
    service = TestBed.inject(CloudinaryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should upload file and return mapped response', (done) => {
    const mockFile = new File(['dummy content'], 'dummy.png', { type: 'image/png' });
    const mockFolder = 'test_folder';
    const mockResponse = {
      secure_url: 'https://dummy_url',
      public_id: 'dummy_pub_id'
    };

    const fetchSpy = spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-type': 'application/json' }
      }))
    );

    service.uploadFile(mockFile, mockFolder).subscribe(res => {
      expect(res.secureUrl).toEqual('https://dummy_url');
      expect(res.publicId).toEqual('dummy_pub_id');
      expect(fetchSpy).toHaveBeenCalled();
      done();
    });
  });

  it('should throw an error on failed upload', (done) => {
    const mockFile = new File([''], 'dummy.png');
    const fetchSpy = spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(new Response('', {
        status: 400,
        statusText: 'Bad Request'
      }))
    );

    service.uploadFile(mockFile, 'folder').subscribe({
      next: () => done.fail('Expected an error, not successful response'),
      error: (err) => {
        expect(err.message).toContain('Cloudinary upload failed: Bad Request');
        expect(fetchSpy).toHaveBeenCalled();
        done();
      }
    });
  });
});
